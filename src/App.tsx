import React, { Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './core/components/Layout';
import ProtectedRoute from './core/components/ProtectedRoute';
import { ToastProvider } from './core/components/ToastProvider';
import { ConfirmProvider } from './core/components/ConfirmProvider';
import { LoadingState } from './core/ui';
import { isManager } from './core/lib/session';
import LoginPage from './features/auth/pages/LoginPage';

// Route-level code splitting keeps the first load small on phones.
const DashboardPage = lazy(() => import('./features/dashboard/pages/DashboardPage'));
const OrdersPage = lazy(() => import('./features/orders/pages/OrdersPage'));
const CatalogPage = lazy(() => import('./features/catalog/pages/CatalogPage'));
const FinancePage = lazy(() => import('./features/finance/pages/FinancePage'));
const ProfilePage = lazy(() => import('./features/profile/pages/ProfilePage'));
const SettingsPage = lazy(() => import('./features/profile/pages/SettingsPage'));
const BranchesPage = lazy(() => import('./features/profile/pages/BranchesPage'));
const AllOrdersPage = lazy(() => import('./features/orders/pages/AllOrdersPage'));
const CreateOrderPage = lazy(() => import('./features/orders/pages/CreateOrderPage'));
const StaffPage = lazy(() => import('./features/staff/pages/StaffPage'));
const ShiftPage = lazy(() => import('./features/shifts/pages/ShiftPage'));
const TablesPage = lazy(() => import('./features/tables/pages/TablesPage'));
const DeliveryZonesPage = lazy(() => import('./features/delivery-zones/pages/DeliveryZonesPage'));
const PromotionsPage = lazy(() => import('./features/promotions/pages/PromotionsPage'));

/** Owner-only screens: managers were able to open them by typing the URL. */
const OwnerOnly: React.FC<{ children: React.ReactElement }> = ({ children }) =>
  isManager() ? <Navigate to="/orders" replace /> : children;

const page = (el: React.ReactElement) => <Suspense fallback={<LoadingState className="min-h-[50vh]" />}>{el}</Suspense>;

const App: React.FC = () => {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <HashRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={page(<DashboardPage />)} />
              <Route path="orders" element={page(<OrdersPage />)} />
              <Route path="new-order" element={page(<CreateOrderPage />)} />
              <Route path="catalog" element={page(<CatalogPage />)} />
              <Route path="promotions" element={page(<PromotionsPage />)} />
              <Route path="finance" element={<OwnerOnly>{page(<FinancePage />)}</OwnerOnly>} />
              <Route path="branches" element={<OwnerOnly>{page(<BranchesPage />)}</OwnerOnly>} />
              <Route path="delivery-zones" element={<OwnerOnly>{page(<DeliveryZonesPage />)}</OwnerOnly>} />
              <Route path="profile" element={page(<ProfilePage />)} />
              <Route path="settings" element={page(<SettingsPage />)} />
              <Route path="all-orders" element={page(<AllOrdersPage />)} />
              <Route path="staff" element={page(<StaffPage />)} />
              <Route path="shift" element={page(<ShiftPage />)} />
              <Route path="tables" element={page(<TablesPage />)} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </ConfirmProvider>
    </ToastProvider>
  );
};

export default App;
