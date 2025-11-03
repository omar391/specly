import React, { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card"
import { apiClient } from "@/lib/api-client"

interface ProfileVersion {
  id: string
  version_number: number
  created_at: string
  manifest?: any
}

export function ProfileVersionPage() {
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "")
  const profileName = params.get("name") || undefined

  const [versions, setVersions] = useState<ProfileVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ProfileVersion | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const maybeFn = (apiClient as any).getProfileVersions
        let res
        if (typeof maybeFn === "function" && profileName) {
          res = await maybeFn.call(apiClient, profileName)
        } else {
          // Simulated data for demo purposes
          res = {
            data: {
              versions: [
                {
                  id: "v3",
                  version_number: 3,
                  created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
                  manifest: { setting: "value", inherit_from: "default" },
                },
                {
                  id: "v2",
                  version_number: 2,
                  created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
                  manifest: { setting: "older" },
                },
              ],
            },
          }
        }

        if (!alive) return
        if (res?.error) {
          setError(res.error)
          setVersions([])
        } else {
          setVersions(res.data?.versions || [])
        }
      } catch (err: any) {
        setError(String(err?.message || err))
      } finally {
        if (alive) setLoading(false)
      }
    })()

    return () => {
      alive = false
    }
  }, [profileName])

  function handleBack() {
    // Prefer history back but ensure navigating to profiles page if needed
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back()
    } else if (typeof window !== "undefined") {
      window.location.href = "/profiles"
    }
  }

  async function copyManifest(m: any) {
    if (!m) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(m, null, 2))
    } catch {
      // ignore
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Profile: {profileName || "—"}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleBack} aria-label="Back to profiles">
            Back
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-600">Loading versions...</div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {versions.map((v) => (
            <Card key={v.id}>
              <CardHeader>
                <CardTitle>Version {v.version_number}</CardTitle>
                <div className="text-sm text-muted-foreground">{new Date(v.created_at).toLocaleString()}</div>
              </CardHeader>
              <CardContent>
                <div className="text-sm font-mono break-all">
                  id: {v.id}
                </div>
              </CardContent>
              <CardFooter>
                <div className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelected(v)}
                    aria-label={`View manifest for version ${v.version_number}`}
                  >
                    View
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => copyManifest(v.manifest)}
                    aria-label={`Copy manifest for version ${v.version_number}`}
                  >
                    Copy manifest
                  </Button>
                </div>
              </CardFooter>
            </Card>
          ))}

          {versions.length === 0 && <div className="text-gray-500">No versions found.</div>}
        </div>
      )}

      {selected && (
        <div className="mt-6">
          <h2 className="text-lg font-medium">Manifest (version {selected.version_number})</h2>
          <pre className="bg-gray-50 border rounded p-4 mt-2 overflow-auto text-sm font-mono">
            {JSON.stringify(selected.manifest || {}, null, 2)}
          </pre>
          <div className="flex gap-2 mt-3">
            <Button variant="outline" size="sm" onClick={() => setSelected(null)}>Close</Button>
            <Button size="sm" onClick={() => copyManifest(selected.manifest)}>Copy JSON</Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProfileVersionPage