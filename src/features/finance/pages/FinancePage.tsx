import React, { useState } from 'react';
import { 
  TrendingUp, 
  DollarSign, 
  Download,
  AlertCircle,
  HelpCircle,
  CheckCircle,
  Clock,
  ArrowDownLeft
} from 'lucide-react';
import { mockFinanceData } from '../mock/financeData';

const FinancePage: React.FC = () => {
  const [filter, setFilter] = useState<'all' | 'paid' | 'refunded'>('all');
  const summary = mockFinanceData;

  const formatUzS = (amount: number) => {
    return amount.toLocaleString('uz-UZ') + " UZS";
  };

  const getFilteredTransactions = () => {
    switch (filter) {
      case 'paid':
        return summary.transactions.filter((t) => t.status === 'PAID');
      case 'refunded':
        return summary.transactions.filter((t) => t.status === 'REFUNDED');
      case 'all':
      default:
        return summary.transactions;
    }
  };

  const getPaymentBadge = (method: string) => {
    switch (method) {
      case 'CLICK':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/10">CLICK</span>;
      case 'PAYME':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/10">Payme</span>;
      case 'CASH':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-500/10 text-slate-400 border border-slate-500/10">CASH</span>;
      case 'UZCARD':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/10">Uzcard</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-500/10 text-slate-300">{method}</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400"><CheckCircle className="w-3.5 h-3.5" /> To'landi</span>;
      case 'REFUNDED':
        return <span className="flex items-center gap-1 text-xs font-semibold text-rose-400"><ArrowDownLeft className="w-3.5 h-3.5" /> Qaytarildi</span>;
      case 'PENDING':
        return <span className="flex items-center gap-1 text-xs font-semibold text-amber-400"><Clock className="w-3.5 h-3.5 animate-pulse" /> Kutilmoqda</span>;
      default:
        return <span>{status}</span>;
    }
  };

  // Find max weekly amount for chart scale
  const maxWeeklyAmount = Math.max(...summary.weeklyRevenue.map(d => d.amount));
  const filteredTxns = getFilteredTransactions();

  return (
    <div className="space-y-8 font-Outfit">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-2">
            Moliya <DollarSign className="w-7 h-7 text-brand" />
          </h1>
          <p className="text-slate-400">Tushumlar, komissiyalar va to'lovlar tarixi hisoboti</p>
        </div>

        <button
          onClick={() => alert("Moliya hisoboti Excel formatda yuklab olindi (MOCK)")}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition text-slate-300 text-sm cursor-pointer self-start sm:self-auto"
        >
          <Download className="w-4 h-4" />
          <span>Hisobotni yuklash</span>
        </button>
      </div>

      {/* Grid of Finance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Gross Sales */}
        <div className="p-6 rounded-2xl bg-darkCard border border-white/5 relative overflow-hidden group hover:border-brand/20 transition duration-300">
          <div className="flex items-center justify-between mb-4">
            <span className="p-3 rounded-xl bg-brand/10 text-brand"><DollarSign className="w-6 h-6" /></span>
            <span className="text-xs font-semibold px-2 py-0.5 bg-brand/10 text-brand rounded">Ushbu oy</span>
          </div>
          <p className="text-sm font-medium text-slate-400">Umumiy savdo tushumi</p>
          <h3 className="text-2xl font-bold text-white mt-1.5">{formatUzS(summary.totalRevenue)}</h3>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Xizmatlar komissiyasi kiritilmagan</span>
          </div>
        </div>

        {/* Card 2: Net Payout */}
        <div className="p-6 rounded-2xl bg-darkCard border border-white/5 relative overflow-hidden group hover:border-emerald-500/20 transition duration-300">
          <div className="flex items-center justify-between mb-4">
            <span className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400"><CheckCircle className="w-6 h-6" /></span>
            <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded">90% Ulanish</span>
          </div>
          <p className="text-sm font-medium text-slate-400">Karta yoki hisobga to'langan</p>
          <h3 className="text-2xl font-bold text-emerald-400 mt-1.5">{formatUzS(summary.netPayout)}</h3>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-emerald-400/90 font-medium">To'lovlar to'liq amalga oshirilgan</span>
          </div>
        </div>

        {/* Card 3: Platform fee */}
        <div className="p-6 rounded-2xl bg-darkCard border border-white/5 relative overflow-hidden group hover:border-rose-500/20 transition duration-300">
          <div className="flex items-center justify-between mb-4">
            <span className="p-3 rounded-xl bg-rose-500/10 text-rose-400"><HelpCircle className="w-6 h-6" /></span>
            <span className="text-xs font-semibold px-2 py-0.5 bg-rose-500/10 text-rose-400 rounded">10% Platforma haq</span>
          </div>
          <p className="text-sm font-medium text-slate-400">Platforma komissiyasi</p>
          <h3 className="text-2xl font-bold text-rose-400 mt-1.5">{formatUzS(summary.commissionFee)}</h3>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
            <span>MilliyGo xizmat ko'rsatish haqi</span>
          </div>
        </div>
      </div>

      {/* Grid: Graphical Chart & Transaction List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Weekly Chart */}
        <div className="lg:col-span-1 p-6 rounded-2xl bg-darkCard border border-white/5 space-y-6 flex flex-col justify-between h-[360px]">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center justify-between">
              <span>Haftalik daromad</span>
              <span className="text-xs font-normal text-slate-400">Tushumlar diagrammasi</span>
            </h3>
          </div>

          {/* Premium pure CSS Bar Chart */}
          <div className="flex items-end justify-between gap-2 h-48 pt-4">
            {summary.weeklyRevenue.map((item, idx) => {
              const pct = (item.amount / maxWeeklyAmount) * 85; // Max height 85%
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2 group cursor-pointer">
                  {/* Tooltip on Hover */}
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-slate-950 text-white font-bold text-[9px] px-1.5 py-0.5 rounded absolute -translate-y-12 shadow z-10 whitespace-nowrap">
                    {item.amount / 1000}k
                  </span>
                  
                  {/* Visual Bar */}
                  <div 
                    style={{ height: `${pct}%` }} 
                    className="w-full rounded-t-lg bg-gradient-to-t from-brand/50 to-brand group-hover:from-brand group-hover:to-brand-light transition-all duration-300 min-h-[4px]"
                  />
                  
                  {/* Label */}
                  <span className="text-slate-400 text-xs font-semibold uppercase">{item.day}</span>
                </div>
              );
            })}
          </div>

          <div className="pt-4 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
            <span>Eng yuqori kun</span>
            <span className="font-bold text-white">{formatUzS(maxWeeklyAmount)}</span>
          </div>
        </div>

        {/* Transactions list */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-darkCard border border-white/5 flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <h3 className="text-lg font-bold text-white">Tranzaksiyalar tarixi</h3>
            
            {/* Action filters */}
            <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-white/5 self-start">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  filter === 'all' ? 'bg-white/5 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Barchasi
              </button>
              <button
                onClick={() => setFilter('paid')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  filter === 'paid' ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                To'langanlar
              </button>
              <button
                onClick={() => setFilter('refunded')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  filter === 'refunded' ? 'bg-rose-500/10 text-rose-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Qaytarilganlar
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {filteredTxns.length > 0 ? (
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-slate-400 text-xs uppercase tracking-wider font-semibold">
                    <th className="pb-3.5">ID / Sana</th>
                    <th className="pb-3.5 text-center">Turi</th>
                    <th className="pb-3.5 text-center">Holat</th>
                    <th className="pb-3.5 text-right">Summa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-300">
                  {filteredTxns.map((txn) => (
                    <tr key={txn.id} className="hover:bg-white/[0.01] transition-colors">
                      <td className="py-3.5">
                        <div className="font-bold text-white text-xs">{txn.id}</div>
                        <div className="text-[10px] text-slate-500">Buyurtma #{txn.orderId} • {txn.date}</div>
                      </td>
                      <td className="py-3.5 text-center">{getPaymentBadge(txn.paymentMethod)}</td>
                      <td className="py-3.5 text-center">{getStatusBadge(txn.status)}</td>
                      <td className={`py-3.5 text-right font-semibold ${txn.status === 'REFUNDED' ? 'text-rose-400 line-through' : 'text-white'}`}>
                        {formatUzS(txn.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <AlertCircle className="w-12 h-12 stroke-[1.5] mb-2" />
                <p>Hech qanday tranzaksiya topilmadi</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinancePage;
