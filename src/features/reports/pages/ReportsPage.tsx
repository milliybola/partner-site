import React, { Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, DollarSign } from 'lucide-react';
import { LoadingState, Segmented } from '../../../core/ui';

const DashboardPage = lazy(() => import('../../dashboard/pages/DashboardPage'));
const FinancePage = lazy(() => import('../../finance/pages/FinancePage'));

type Tab = 'stats' | 'finance';

/** «Hisobotlar»: Statistika va Moliya bitta bandda — tab `?tab=` da saqlanadi (havola bilan ulashsa bo'ladi). */
const ReportsPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'finance' ? 'finance' : 'stats';

  return (
    <div className="space-y-4">
      <Segmented<Tab>
        value={tab}
        onChange={(v) => setParams(v === 'stats' ? {} : { tab: v }, { replace: true })}
        options={[
          { value: 'stats', label: 'Statistika', icon: <BarChart3 className="w-4 h-4" /> },
          { value: 'finance', label: 'Moliya', icon: <DollarSign className="w-4 h-4" /> },
        ]}
      />
      <Suspense fallback={<LoadingState className="min-h-[40vh]" />}>{tab === 'finance' ? <FinancePage /> : <DashboardPage />}</Suspense>
    </div>
  );
};

export default ReportsPage;
