import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

const ProtectedRoute = () => {
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const hasHydrated = useAuthStore((state) => state._hasHydrated);

  if (!hasHydrated) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
        Loading session...
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
