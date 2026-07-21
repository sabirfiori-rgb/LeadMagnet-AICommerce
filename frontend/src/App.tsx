import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { OrganizationsPage } from './pages/OrganizationsPage';
import { CrmPage } from './pages/CrmPage';
import { ContactDetailsPage } from './pages/ContactDetailsPage';
import { InboxPage } from './pages/InboxPage';
import { WorkflowPage } from './pages/WorkflowPage';
import { MessagingPage } from './pages/MessagingPage';
import { FunnelsPage } from './pages/FunnelsPage';
import { FunnelBuilderPage } from './pages/FunnelBuilderPage';
import { FunnelPreviewPage } from './pages/FunnelPreviewPage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />

          {/* Protected Routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/organizations"
            element={
              <ProtectedRoute>
                <OrganizationsPage />
              </ProtectedRoute>
            }
          />
          <Route path="/crm" element={<ProtectedRoute><CrmPage /></ProtectedRoute>} />
          <Route path="/crm/contacts/:contactId" element={<ProtectedRoute><ContactDetailsPage /></ProtectedRoute>} />
          <Route path="/inbox" element={<ProtectedRoute><InboxPage /></ProtectedRoute>} />
          <Route path="/automations" element={<ProtectedRoute><WorkflowPage /></ProtectedRoute>} />
          <Route path="/communications" element={<ProtectedRoute><MessagingPage /></ProtectedRoute>} />
          <Route path="/messaging" element={<ProtectedRoute><MessagingPage /></ProtectedRoute>} />
          <Route path="/funnels" element={<ProtectedRoute><FunnelsPage /></ProtectedRoute>} />
          <Route path="/funnels/:funnelId" element={<ProtectedRoute><FunnelBuilderPage /></ProtectedRoute>} />
          <Route path="/funnels/:funnelId/preview" element={<ProtectedRoute><FunnelPreviewPage /></ProtectedRoute>} />

          {/* Redirect root to dashboard */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* 404 */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
