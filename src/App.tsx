import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './core/components/Layout';
import ProtectedRoute from './core/components/ProtectedRoute';

// Lazy loading or direct imports
import LoginPage from './features/auth/pages/LoginPage';
import DashboardPage from './features/dashboard/pages/DashboardPage';
import OrdersPage from './features/orders/pages/OrdersPage';
import CatalogPage from './features/catalog/pages/CatalogPage';
import FinancePage from './features/finance/pages/FinancePage';
import ProfilePage from './features/profile/pages/ProfilePage';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Auth Route */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected Dashboard Shell */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          {/* Main sections */}
          <Route index element={<DashboardPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="catalog" element={<CatalogPage />} />
          <Route path="finance" element={<FinancePage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        {/* Fallback redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
