export interface Transaction {
  id: string;
  orderId: number;
  date: string;
  amount: number;
  paymentMethod: 'CASH' | 'CLICK' | 'PAYME' | 'UZCARD';
  status: 'PAID' | 'REFUNDED' | 'PENDING';
}

export interface FinanceSummary {
  totalRevenue: number;
  netPayout: number;
  commissionFee: number;
  pendingPayout: number;
  completedOrdersCount: number;
  cancelledOrdersCount: number;
  weeklyRevenue: Array<{ day: string; amount: number }>;
  transactions: Transaction[];
}

export const mockFinanceData: FinanceSummary = {
  totalRevenue: 4850000,
  netPayout: 4365000, // 90%
  commissionFee: 485000, // 10%
  pendingPayout: 125000,
  completedOrdersCount: 154,
  cancelledOrdersCount: 12,
  weeklyRevenue: [
    { day: "Dush", amount: 450000 },
    { day: "Sesh", amount: 620000 },
    { day: "Chor", amount: 580000 },
    { day: "Pay", amount: 720000 },
    { day: "Jum", amount: 950000 },
    { day: "Shan", amount: 1100000 },
    { day: "Yak", amount: 430000 }
  ],
  transactions: [
    { id: "TXN-90812", orderId: 10521, date: "16-06-2026 20:10", amount: 135000, paymentMethod: "CASH", status: "PAID" },
    { id: "TXN-90810", orderId: 10520, date: "16-06-2026 19:50", amount: 45000, paymentMethod: "PAYME", status: "PAID" },
    { id: "TXN-90807", orderId: 10518, date: "16-06-2026 19:45", amount: 82000, paymentMethod: "PAYME", status: "PAID" },
    { id: "TXN-90805", orderId: 10517, date: "16-06-2026 19:10", amount: 115000, paymentMethod: "CLICK", status: "PAID" },
    { id: "TXN-90801", orderId: 10516, date: "16-06-2026 18:50", amount: 35000, paymentMethod: "UZCARD", status: "PAID" },
    { id: "TXN-90799", orderId: 10515, date: "16-06-2026 18:30", amount: 65000, paymentMethod: "CLICK", status: "PAID" },
    { id: "TXN-90792", orderId: 10514, date: "16-06-2026 17:15", amount: 98000, paymentMethod: "CASH", status: "REFUNDED" },
    { id: "TXN-90788", orderId: 10512, date: "16-06-2026 16:40", amount: 220000, paymentMethod: "CLICK", status: "PAID" }
  ]
};
