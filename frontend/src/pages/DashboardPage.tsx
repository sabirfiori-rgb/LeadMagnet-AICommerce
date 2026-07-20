import { useAuth } from '../context/AuthContext';

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-12 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-8">
            <h1 className="text-3xl font-bold text-gray-900">
              Welcome, {user?.firstName || user?.email}!
            </h1>
            <p className="mt-2 text-gray-600">
              This is your SaaS dashboard. More features coming soon.
            </p>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-blue-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900">Organizations</h3>
                <p className="mt-2 text-gray-600">Manage your organizations</p>
              </div>
              <div className="bg-green-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900">Workspaces</h3>
                <p className="mt-2 text-gray-600">Create and manage workspaces</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900">Team</h3>
                <p className="mt-2 text-gray-600">Invite and manage team members</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
