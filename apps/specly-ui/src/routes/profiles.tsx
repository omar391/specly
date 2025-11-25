import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Loader2, Plus } from 'lucide-react'

export const Route = createFileRoute('/profiles')({
  component: ProfilesPage,
})

interface Profile {
  id: string
  name: string
  description: string | null
  createdAt: string
}

function ProfilesPage() {
  const queryClient = useQueryClient()
  const [isCreating, setIsCreating] = useState(false)
  const [newProfileName, setNewProfileName] = useState('')
  const [newProfileDesc, setNewProfileDesc] = useState('')

  const { data: profiles, isLoading, error } = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const res = await fetch('/api/profiles')
      if (!res.ok) throw new Error('Failed to fetch profiles')
      const data = await res.json()
      return data.profiles as Profile[]
    },
  })

  const createProfile = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to create profile')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
      setIsCreating(false)
      setNewProfileName('')
      setNewProfileDesc('')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newProfileName.trim()) return
    createProfile.mutate({ name: newProfileName, description: newProfileDesc })
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-red-500">
        Error loading profiles: {error.message}
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-5xl p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Profiles</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage configuration profiles and toolsets
          </p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          <Plus className="h-4 w-4" />
          New Profile
        </button>
      </div>

      {isCreating && (
        <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-medium text-gray-900">Create New Profile</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Name
              </label>
              <input
                type="text"
                id="name"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                placeholder="e.g., Python Backend"
                required
              />
            </div>
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                Description
              </label>
              <textarea
                id="description"
                value={newProfileDesc}
                onChange={(e) => setNewProfileDesc(e.target.value)}
                rows={3}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                placeholder="Optional description..."
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createProfile.isPending}
                className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
              >
                {createProfile.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Profile
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {profiles?.map((profile) => (
          <div
            key={profile.id}
            className="group relative rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <Link to="/profiles/$profile" params={{ profile: profile.name }} className="block">
              <h3 className="text-lg font-medium text-gray-900 hover:text-blue-600 hover:underline">{profile.name}</h3>
            </Link>
            {profile.description && (
              <p className="mt-2 text-sm text-gray-500">{profile.description}</p>
            )}
            <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
              <span>Created {new Date(profile.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
        {profiles?.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
            <h3 className="mt-2 text-sm font-medium text-gray-900">No profiles</h3>
            <p className="mt-1 text-sm text-gray-500">Get started by creating a new profile.</p>
          </div>
        )}
      </div>
    </div>
  )
}
