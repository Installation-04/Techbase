import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

const Login = lazy(() => import('./pages/Login'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const Home = lazy(() => import('./pages/Home'));
const Clients = lazy(() => import('./pages/Clients'));
const ClientDetail = lazy(() => import('./pages/ClientDetail'));
const WorkOrders = lazy(() => import('./pages/WorkOrders'));
const Procedures = lazy(() => import('./pages/Procedures'));
const Admin = lazy(() => import('./pages/Admin'));
const Journee = lazy(() => import('./pages/Journee'));

// On a phone, a technician lands on "Ma journée" once per browser session;
// "Accueil" stays reachable from the menu afterwards (Journee sets the flag on mount).
function HomeOrDay() {
  const { user } = useAuth();
  let go = false;
  try {
    go = user?.role !== 'admin'
      && window.matchMedia('(max-width: 767px)').matches
      && !sessionStorage.getItem('journee-landed');
  } catch { /* storage or matchMedia unavailable: show the home page */ }
  return go ? <Navigate to="/journee" replace /> : <Home />;
}

export default function App() {
  return (
    <Suspense fallback={null}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout>
              <HomeOrDay />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/journee"
        element={
          <ProtectedRoute>
            <Layout>
              <Journee />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/clients"
        element={
          <ProtectedRoute>
            <Layout>
              <Clients />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/clients/:id"
        element={
          <ProtectedRoute>
            <Layout>
              <ClientDetail />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/work-orders"
        element={
          <ProtectedRoute>
            <Layout>
              <WorkOrders />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/procedures"
        element={
          <ProtectedRoute>
            <Layout>
              <Procedures />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute adminOnly>
            <Layout>
              <Admin />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route path="/users" element={<Navigate to="/admin?tab=users" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
