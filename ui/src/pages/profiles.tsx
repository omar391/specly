import React, { useEffect, useState } from "react"
import { apiClient } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import ProfileVersionCreator from "@/components/profile-version-creator"

interface ProfileItem {
  name: string
  latest_version?: number
  description?: string
}

export function ProfilesPage() {
  const [profiles, setProfiles] = useState<ProfileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [creatorOpen, setCreatorOpen] = useState(false)
  const [creatorProfile, setCreatorProfile] = useState<string | undefined>(undefined)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const maybeFn = (apiClient as any).getProfiles
        let res
        if (typeof maybeFn === "function") {
          res = await maybeFn.call(apiClient)
        } else {
          // Simulate fetch
          res = {
            data: {
              profiles: [
                { name: "default", latest_version: 3, description: "Default profile" },
                { name: "experimental", latest_version: 1, description: "Experimental settings" },
              ],
            },
          }
        }

        if (!alive) return
        if (res?.error) {
          setError(res.error)
          setProfiles([])
        } else {
          setProfiles(res.data?.profiles || [])
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
  }, [])

  const filtered = profiles.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))

  function openCreatorFor(name?: string) {
    setCreatorProfile(name)
    setCreatorOpen(true)
  }

  function handleCreated(result: any) {
    // Optimistically add/refresh the profile in the list
    if (!result) return
    const name = result.name || creatorProfile
    const version = result.version_number ?? result.latest_version ?? undefined
    setProfiles((prev) => {
      const exists = prev.find((p) => p.name === name)
      if (exists) {
        return prev.map((p) => (p.name === name ? { ...p, latest_version: version || p.latest_version } : p))
      }
      return [{ name: name || "unknown", latest_version: version }, ...prev]
    })
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Profiles</h1>
        <div style={{ width: 320 }}>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search profiles"
            aria-label="Search profiles"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-gray-600">Loading...</div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((p) => (
            <Card key={p.name}>
              <CardHeader>
                <CardTitle>{p.name}</CardTitle>
                {p.description && <div className="text-sm text-muted-foreground">{p.description}</div>}
              </CardHeader>
              <CardContent>
                <div className="text-sm text-gray-700">
                  Latest version:{" "}
                  <span className="font-mono">{p.latest_version != null ? p.latest_version : "—"}</span>
                </div>
              </CardContent>
              <CardFooter>
                <div className="flex gap-2 ml-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      (window.location.href = `/profile-version?name=${encodeURIComponent(p.name)}`)
                    }
                    aria-label={`View versions for ${p.name}`}
                  >
                    View
                  </Button>
                  <Button size="sm" onClick={() => openCreatorFor(p.name)} aria-label={`Create version for ${p.name}`}>
                    Create Version
                  </Button>
                </div>
              </CardFooter>
            </Card>
          ))}

          {filtered.length === 0 && (
            <div className="text-gray-500">No profiles found.</div>
          )}
        </div>
      )}

      <div>
        <Button onClick={() => openCreatorFor(undefined)}>Create New Profile Version</Button>
      </div>

      <ProfileVersionCreator
        open={creatorOpen}
        profileName={creatorProfile}
        onClose={() => setCreatorOpen(false)}
        onCreated={(res: any) => {
          handleCreated(res)
          setCreatorOpen(false)
        }}
      />
    </div>
  )
}

export default ProfilesPage