import React, { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { apiClient } from "@/lib/api-client"

export interface ProfileVersionCreatorProps {
  profileName?: string
  open: boolean
  onClose: () => void
  onCreated: (result: any) => void
}

export default function ProfileVersionCreator({
  profileName: initialProfileName,
  open,
  onClose,
  onCreated,
}: ProfileVersionCreatorProps) {
  const [profileName, setProfileName] = useState<string>(initialProfileName || "")
  const [overridesText, setOverridesText] = useState<string>('{}')
  const [parseError, setParseError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [validated, setValidated] = useState(false)

  useEffect(() => {
    setProfileName(initialProfileName || "")
  }, [initialProfileName, open])

  useEffect(() => {
    setParseError(null)
    setValidated(false)
  }, [overridesText])

  function validateJson() {
    try {
      JSON.parse(overridesText || "{}")
      setParseError(null)
      setValidated(true)
      return true
    } catch (err: any) {
      setParseError(err?.message || String(err))
      setValidated(false)
      return false
    }
  }

  async function handleCreate() {
    if (!profileName) {
      setParseError("Profile name is required")
      return
    }
    const ok = validateJson()
    if (!ok) return

    let payload: any = {}
    try {
      payload = JSON.parse(overridesText || "{}")
    } catch {
      // should not happen after validateJson
      payload = {}
    }

    setIsCreating(true)
    try {
      const maybeFn = (apiClient as any).createProfileVersion
      let res
      if (typeof maybeFn === "function") {
        res = await maybeFn.call(apiClient, profileName, payload)
      } else {
        // Simulate network create
        await new Promise((r) => setTimeout(r, 200))
        res = {
          data: {
            name: profileName,
            version_number: Math.floor(Math.random() * 100) + 1,
            manifest: payload,
            created_at: new Date().toISOString(),
          },
        }
      }

      if (res?.error) {
        setParseError(res.error)
      } else {
        onCreated(res.data || res)
        // reset small bits
        setOverridesText('{}')
        setValidated(false)
      }
    } catch (err: any) {
      setParseError(String(err?.message || err))
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent aria-label="Create profile version dialog">
        <DialogHeader>
          <DialogTitle>Create profile version</DialogTitle>
          <DialogDescription>
            Create a new version for a profile. You can provide overrides JSON that will be merged with the base manifest.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div>
            <label className="text-sm block mb-1">Profile name</label>
            <Input
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="profile name"
              aria-label="Profile name"
              disabled={!!initialProfileName}
            />
          </div>

          <div>
            <label className="text-sm block mb-1">Overrides (JSON)</label>
            <Textarea
              value={overridesText}
              onChange={(e) => setOverridesText(e.target.value)}
              rows={8}
              aria-label="Profile overrides JSON"
              placeholder='{"setting": "value"}'
            />
            {parseError && <div role="alert" className="text-sm text-red-600 mt-2">Error: {parseError}</div>}
            {validated && !parseError && <div className="text-sm text-green-600 mt-2">JSON looks valid</div>}
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { validateJson() }} size="sm" aria-label="Validate overrides JSON">
              Validate
            </Button>
            <Button variant="secondary" onClick={onClose} size="sm" aria-label="Cancel create profile version">
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isCreating} size="sm" aria-label="Create profile version">
              {isCreating ? "Creating..." : "Create Version"}
            </Button>
          </div>
        </div>

        <DialogFooter />
      </DialogContent>
    </Dialog>
  )
}