import apiClient from '../../../core/api/client';

export type OverviewPeriod = 'today' | 'week' | 'month';

export interface BranchLive {
  active_orders: number;
  late_orders: number;
  new_orders: number;
}

export interface BranchCouriers {
  total: number;
  online: number;
  free: number;
}

/** Bitta filial (yoki «Filialsiz») qatori — API_CONTRACT_BRANCHES.md */
export interface BranchRow {
  uuid: string | null;
  name: string;
  address: string;
  status: 'ACTIVE' | 'INACTIVE' | 'CLOSED' | string;
  is_main: boolean;
  is_working_now: boolean;
  revenue: number;
  orders: number;
  delivered: number;
  cancelled: number;
  avg_check: number;
  cancel_rate: number;
  avg_delivery_minutes: number | null;
  revenue_delta: number | null;
  orders_delta: number | null;
  avg_check_delta: number | null;
  revenue_share: number;
  prev: { revenue: number; orders: number };
  live: BranchLive;
  couriers: BranchCouriers;
}

export interface OverviewTotals {
  revenue: number;
  orders: number;
  delivered: number;
  cancelled: number;
  avg_check: number;
  cancel_rate: number;
  avg_delivery_minutes: number | null;
  revenue_delta: number | null;
  orders_delta: number | null;
  avg_check_delta: number | null;
  active_orders: number;
  late_orders: number;
}

export interface OverviewAlert {
  level: 'danger' | 'warning' | 'info';
  code: string;
  filial_uuid: string | null;
  text: string;
}

export interface BranchOverview {
  period: OverviewPeriod;
  from: string;
  to: string;
  compared_to: { from: string; to: string };
  totals: OverviewTotals;
  branches: BranchRow[];
  unassigned: BranchRow | null;
  best_branch: string | null;
  weakest_branch: string | null;
  alerts: OverviewAlert[];
}

export const branchApi = {
  getOverview: async (period: OverviewPeriod): Promise<BranchOverview> => {
    const res = await apiClient.get('partner/branches/overview/', { params: { period } });
    const data = res.data?.data;
    if (!data || typeof data !== 'object' || !Array.isArray(data.branches)) {
      throw new Error("Boshqaruv ma'lumotlari formati noto'g'ri");
    }
    return data as BranchOverview;
  },
};
