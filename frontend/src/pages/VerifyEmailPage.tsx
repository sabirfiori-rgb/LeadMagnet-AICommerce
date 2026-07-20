import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';

export function VerifyEmailPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  useEffect(() => {
    if (token) {
      verifyEmail();
    } else {
      setLoading(false);
    }
  }, [token]);

  const verifyEmail = async () => {
    try {
      await authApi.verifyEmail(token!);
      setSuccess(true);
      setTimeout(() => navigate('/dashboard'), 3000);
    } catch (err: any) {
      setError(
        err.response?.data?.error || 'Failed to verify email. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          {loading && (
            <>
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              <h2 className="mt-4 text-2xl font-bold text-gray-900">
                Verifying email...
              </h2>
            </>
          )}

          {success && (
            <>
              <div className="text-4xl">✅</div>
              <h2 className="mt-4 text-2xl font-bold text-gray-900">
                Email verified!
              </h2>
              <p className="mt-2 text-gray-600">
                Redirecting to dashboard...
              </p>
            </>
          )}

          {error && (
            <>
              <div className="text-4xl">❌</div>
              <h2 className="mt-4 text-2xl font-bold text-gray-900">
                Verification failed
              </h2>
              <p className="mt-2 text-sm text-red-600">{error}</p>
              <button
                onClick={() => navigate('/login')}
                className="mt-6 inline-flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                Back to login
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
