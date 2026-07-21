import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';

export function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);

  const handleLogout = async () => {
    try {
      await authApi.logout();
      logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">LeadMagnet + AI Commerce</h1>
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-gray-100"
            >
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-gray-500">{user?.email}</p>
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>

            {showMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg z-10">
                <button
                  onClick={() => {
                    navigate('/profile');
                    setShowMenu(false);
                  }}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Profile
                </button>
                <button
                  onClick={() => {
                    navigate('/organizations');
                    setShowMenu(false);
                  }}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Organizations
                </button>
                <hr className="my-1" />
                <button
                  onClick={() => {
                    handleLogout();
                    setShowMenu(false);
                  }}
                  className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto py-12 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              Welcome back, {user?.firstName}! 👋
            </h2>
            <p className="text-gray-600">
              This is your SaaS dashboard. Start by creating an organization to manage your team and workspaces.
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-6 cursor-pointer hover:shadow-lg transition">
            <div className="text-3xl mb-2">🏢</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Organizations</h3>
            <p className="text-sm text-gray-600 mb-4">
              Create and manage organizations for your team
            </p>
            <button
              onClick={() => navigate('/organizations')}
              className="text-blue-600 hover:text-blue-700 font-medium text-sm"
            >
              View Organizations →
            </button>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-6 cursor-pointer hover:shadow-lg transition">
            <div className="text-3xl mb-2">💼</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">CRM</h3>
            <p className="text-sm text-gray-600 mb-4">
              Manage contacts, tags, deals, and sales pipelines
            </p>
            <button
              onClick={() => navigate('/crm')}
              className="text-green-600 hover:text-green-700 font-medium text-sm"
            >
              Open CRM →
            </button>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-6 cursor-pointer hover:shadow-lg transition">
            <div className="text-3xl mb-2">👥</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Unified Inbox</h3>
            <p className="text-sm text-gray-600 mb-4">
              Manage customer conversations across channels
            </p>
            <button
              onClick={() => navigate('/inbox')}
              className="text-purple-600 hover:text-purple-700 font-medium text-sm"
            >
              Open Inbox →
            </button>
          </div>

          <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-6 cursor-pointer hover:shadow-lg transition">
            <div className="text-3xl mb-2">⚙️</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Automations</h3>
            <p className="text-sm text-gray-600 mb-4">
              Build visual marketing and follow-up workflows
            </p>
            <button
              onClick={() => navigate('/automations')}
              className="text-amber-700 hover:text-amber-800 font-medium text-sm"
            >
              Open Automations →
            </button>
          </div>

          <div className="bg-gradient-to-br from-rose-50 to-rose-100 rounded-lg p-6 cursor-pointer hover:shadow-lg transition">
            <div className="text-3xl mb-2">🎯</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Sales Funnels</h3>
            <p className="text-sm text-gray-600 mb-4">
              Build landing pages, sales funnels, and track conversions
            </p>
            <button
              onClick={() => navigate('/funnels')}
              className="text-rose-700 hover:text-rose-800 font-medium text-sm"
            >
              Open Funnels →
            </button>
          </div>
        </div>

        {/* Features Preview */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-8 border-b border-gray-200">
            <h3 className="text-xl font-bold text-gray-900">Phase 1: Authentication & Multi-Tenant Foundation ✅</h3>
          </div>
          <div className="px-6 py-8">
            <ul className="space-y-3">
              <li className="flex items-center gap-2">
                <span className="text-green-600 text-xl">✓</span>
                <span className="text-gray-700">User registration and login</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-600 text-xl">✓</span>
                <span className="text-gray-700">Email verification</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-600 text-xl">✓</span>
                <span className="text-gray-700">Password reset flows</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-600 text-xl">✓</span>
                <span className="text-gray-700">Organizations with roles & permissions</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-600 text-xl">✓</span>
                <span className="text-gray-700">Multi-workspace support</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-600 text-xl">✓</span>
                <span className="text-gray-700">Tenant isolation</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Upcoming Phases */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h4 className="text-lg font-semibold text-gray-900 mb-2">Phase 2: Lead Management</h4>
            <p className="text-gray-600 text-sm">
              Lead generation, capture forms, and lead management system
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h4 className="text-lg font-semibold text-gray-900 mb-2">Phase 3: AI Commerce</h4>
            <p className="text-gray-600 text-sm">
              AI-powered e-commerce engine and recommendations
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
