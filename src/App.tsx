import React, { Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './core/components/Layout';
import ProtectedRoute from './core/components/ProtectedRoute';
import { ToastProvider } from './core/components/ToastProvider';
import { ConfirmProvider } from './core/components/ConfirmProvider';
import { RejectReasonProvider } from './core/components/RejectReasonProvider';
import { LoadingState } from './core/ui';
import { isManager } from './core/lib/session';
import LoginPage from './features/auth/pages/LoginPage';
import { useVenue } from './venues';
import { VenueOnly } from './venues/VenueOnly';
import { FeatureGate } from './core/components/FeatureGate';

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
const PlanPage = lazy(() => import('./features/profile/pages/PlanPage'));
const BranchOverviewPage = lazy(() => import('./features/branches/pages/BranchOverviewPage'));

// Restoran va do'kon uchun alohida bo'limlar (src/venues)
const RestaurantHomePage = lazy(() => import('./venues/restaurant/pages/RestaurantHomePage'));
const KitchenPage = lazy(() => import('./venues/restaurant/pages/KitchenPage'));
const StoreHomePage = lazy(() => import('./venues/store/pages/StoreHomePage'));
const InventoryPage = lazy(() => import('./venues/store/pages/InventoryPage'));
const PickingPage = lazy(() => import('./venues/store/pages/PickingPage'));

/** Owner-only screens: managers were able to open them by typing the URL. */
const OwnerOnly: React.FC<{ children: React.ReactElement }> = ({ children }) =>
  isManager() ? <Navigate to="/orders" replace /> : children;

/** `/` — hamkor turiga mos bosh sahifa; menejer to'g'ridan-to'g'ri navbatga o'tadi. */
const VenueHome: React.FC = () => {
  const { isStore } = useVenue();
  if (isManager()) return <Navigate to="/orders" replace />;
  return isStore ? <StoreHomePage /> : <RestaurantHomePage />;
};

const page = (el: React.ReactElement) => <Suspense fallback={<LoadingState className="min-h-[50vh]" />}>{el}</Suspense>;

const App: React.FC = () => {
  return (
    <ToastProvider>
      <ConfirmProvider>
      <RejectReasonProvider>
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
              <Route index element={page(<VenueHome />)} />
              <Route path="overview" element={<OwnerOnly>{page(<BranchOverviewPage />)}</OwnerOnly>} />
              <Route path="statistics" element={<OwnerOnly>{page(<DashboardPage />)}</OwnerOnly>} />
              <Route path="kitchen" element={<VenueOnly kind="restaurant">{page(<KitchenPage />)}</VenueOnly>} />
              <Route path="inventory" element={<VenueOnly kind="store">{page(<InventoryPage />)}</VenueOnly>} />
              <Route path="picking" element={<VenueOnly kind="store">{page(<PickingPage />)}</VenueOnly>} />
              <Route path="orders" element={page(<OrdersPage />)} />
              <Route path="new-order" element={page(<CreateOrderPage />)} />
              <Route path="catalog" element={page(<CatalogPage />)} />
              <Route path="promotions" element={page(<PromotionsPage />)} />
              <Route path="finance" element={<OwnerOnly>{page(<FinancePage />)}</OwnerOnly>} />
              <Route path="branches" element={<OwnerOnly>{page(<BranchesPage />)}</OwnerOnly>} />
              <Route path="delivery-zones" element={<OwnerOnly>{page(<DeliveryZonesPage />)}</OwnerOnly>} />
              <Route path="profile" element={page(<ProfilePage />)} />
              <Route path="settings" element={page(<SettingsPage />)} />
              <Route path="plan" element={page(<PlanPage />)} />
              <Route path="all-orders" element={page(<AllOrdersPage />)} />
              <Route path="staff" element={page(<StaffPage />)} />
              <Route path="couriers" element={page(<StaffPage initialTab="couriers" />)} />
              <Route path="shift" element={page(<ShiftPage />)} />
              <Route path="tables" element={<VenueOnly kind="restaurant"><FeatureGate feature="dine_in">{page(<TablesPage />)}</FeatureGate></VenueOnly>} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </RejectReasonProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
};

export default App;
