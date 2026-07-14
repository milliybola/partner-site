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
import SettingsPage from './features/profile/pages/SettingsPage';
import BranchesPage from './features/profile/pages/BranchesPage';
import AllOrdersPage from './features/orders/pages/AllOrdersPage';
import CreateOrderPage from './features/orders/pages/CreateOrderPage';
import StaffPage from './features/staff/pages/StaffPage';
import ShiftPage from './features/shifts/pages/ShiftPage';
import TablesPage from './features/tables/pages/TablesPage';

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
          <Route path="new-order" element={<CreateOrderPage />} />
          <Route path="catalog" element={<CatalogPage />} />
          <Route path="finance" element={<FinancePage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="branches" element={<BranchesPage />} />
          <Route path="all-orders" element={<AllOrdersPage />} />
          <Route path="staff" element={<StaffPage />} />
          <Route path="shift" element={<ShiftPage />} />
          <Route path="tables" element={<TablesPage />} />
        </Route>

        {/* Fallback redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
