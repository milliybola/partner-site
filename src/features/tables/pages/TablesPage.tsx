import React, { useState, useEffect, useCallback } from 'react';
import { 
  Plus, 
  Trash2, 
  Edit, 
  AlertCircle, 
  RefreshCw, 
  Users, 
  Info,
  CheckCircle,
  HelpCircle,
  ShieldAlert,
  Loader2,
  FileSpreadsheet
} from 'lucide-react';
import { STORAGE_KEYS } from '../../../core/config/constants';
import { tablesApi } from '../services/tablesApi';
import type { TableModel, TableStatus } from '../services/tablesApi';
import { filialApi } from '../../orders/services/filialApi';
import type { PartnerFilial } from '../../orders/services/filialApi';
import { TableOrderModal } from '../components/TableOrderModal';

const TablesPage: React.FC = () => {
  // Authentication & Roles
  const partnerData = (() => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PARTNER_DATA);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  })();

  const isWaiter = partnerData?.role === 'waiter';
  const isManagerOrOwner = partnerData?.role === 'manager' || !isWaiter;

  // State Management
  const [tables, setTables] = useState<TableModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // UI Display Preference
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [activeFilter, setActiveFilter] = useState<string>('ALL');

  console.log(setViewMode,setSearchQuery,  setStatusFilter, setActiveFilter);

  // Modals state
  const [isCrudModalOpen, setIsCrudModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState<TableModel | null>(null);
  const [orderingTable, setOrderingTable] = useState<TableModel | null>(null);

  // Form states for Single Table CRUD
  const [tableNumber, setTableNumber] = useState('');
  const [capacity, setCapacity] = useState('4');
  const [tableStatus, setTableStatus] = useState<TableStatus>('AVAILABLE');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [displayOrder, setDisplayOrder] = useState('0');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Filial States for Superadmin
  const [filialList, setFilialList] = useState<PartnerFilial[]>([]);
  const [filialUuid, setFilialUuid] = useState('');

  // Form states for Bulk Import
  const [bulkMethod, setBulkMethod] = useState<'generator' | 'raw'>('generator');
  // Generator values
  const [bulkPrefix, setBulkPrefix] = useState('');
  const [bulkStart, setBulkStart] = useState('1');
  const [bulkEnd, setBulkEnd] = useState('5');
  const [bulkCapacity, setBulkCapacity] = useState('4');
  // Raw values
  const [bulkRawText, setBulkRawText] = useState('1, 4\n2, 4\nVIP-1, 8, VIP Kabina');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSuccessMsg, setBulkSuccessMsg] = useState<string | null>(null);

  // Fetch Tables (full data, including active order info, for all roles —
  // waiters need to see occupied tables too in order to manage their live orders)
  const fetchTables = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await tablesApi.getTables();
      setTables(data);
    } catch (err: any) {
      console.error("Failed to fetch tables:", err);
      setError(
        err.response?.data?.message ||
        err.message ||
        "Stollar ma'lumotlarini yuklashda xatolik yuz berdi."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTables();
    if (partnerData?.role !== 'manager') {
      filialApi.getFilials()
        .then(res => setFilialList(res))
        .catch(err => console.error("Failed to load filials in TablesPage:", err));
    }
  }, [fetchTables]);

  // Open Form modal for editing or creating
  const openCrudModal = (table: TableModel | null = null) => {
    if (!isManagerOrOwner) return;
    setFormError(null);
    if (table) {
      setSelectedTable(table);
      setTableNumber(table.table_number);
      setCapacity(String(table.capacity));
      setTableStatus(table.status);
      setNotes(table.notes || '');
      setIsActive(table.is_active ?? true);
      setDisplayOrder(String(table.display_order ?? 0));
      setFilialUuid(table.filial_uuid || '');
    } else {
      setSelectedTable(null);
      setTableNumber('');
      setCapacity('4');
      setTableStatus('AVAILABLE');
      setNotes('');
      setIsActive(true);
      setDisplayOrder(String(tables.length + 1));
      setFilialUuid('');
    }
    setIsCrudModalOpen(true);
  };

  // Submit Single Table Form (Create or Update)
  const handleCrudSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isManagerOrOwner) return;
    setFormError(null);

    const capNum = Number(capacity);
    if (!tableNumber.trim()) {
      setFormError("Stol raqami yoki nomi majburiy.");
      return;
    }
    if (isNaN(capNum) || capNum < 1 || capNum > 100) {
      setFormError("Sig'im 1 dan 100 gacha son bo'lishi kerak.");
      return;
    }

    setSubmitting(true);
    try {
      const payload: Partial<TableModel> = {
        table_number: tableNumber,
        capacity: capNum,
        status: tableStatus,
        notes: notes,
        is_active: isActive,
        display_order: Number(displayOrder) || 0,
        filial_uuid: partnerData?.role === 'manager' ? undefined : (filialUuid || undefined)
      };

      if (selectedTable) {
        await tablesApi.updateTable(selectedTable.uuid, payload);
      } else {
        await tablesApi.createTable(payload);
      }
      setIsCrudModalOpen(false);
      fetchTables();
    } catch (err: any) {
      console.error("CRUD Submit Error:", err);
      setFormError(
        err.response?.data?.message || 
        err.response?.data?.table_number?.[0] ||
        err.message || 
        "Stol ma'lumotlarini saqlashda xatolik."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Delete / Deactivate Table
  const handleDeleteTable = async (uuid: string, tableNumber: string) => {
    if (!isManagerOrOwner) return;
    if (window.confirm(`Haqiqatan ham ${tableNumber}-stolni o'chirmoqchimisiz? (U tizimda faol emas holatiga o'tkaziladi)`)) {
      try {
        await tablesApi.deleteTable(uuid);
        fetchTables();
      } catch (err: any) {
        console.error("Delete table error:", err);
        alert(err.response?.data?.message || "Stolni o'chirishda xatolik yuz berdi.");
      }
    }
  };

  // Toggle active/inactive quick switch
  const handleToggleActive = async (table: TableModel) => {
    if (!isManagerOrOwner) return;
    const updatedState = !(table.is_active ?? true);
    
    // Optimistic UI update
    setTables(prev => prev.map(t => t.uuid === table.uuid ? { ...t, is_active: updatedState } : t));

    try {
      await tablesApi.updateTable(table.uuid, { is_active: updatedState });
      fetchTables();
    } catch (err: any) {
      console.error("Toggle active error:", err);
      setTables(prev => prev.map(t => t.uuid === table.uuid ? { ...t, is_active: !updatedState } : t));
      alert(err.response?.data?.message || "Stol faolligini o'zgartirishda xatolik.");
    }
  };

  // Submit Bulk Import
  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isManagerOrOwner) return;
    setBulkError(null);
    setBulkSuccessMsg(null);
    setBulkSubmitting(true);

    try {
      const tablesPayload: Array<{
        table_number: string;
        capacity: number;
        notes?: string;
        is_active?: boolean;
      }> = [];

      if (bulkMethod === 'generator') {
        const start = parseInt(bulkStart);
        const end = parseInt(bulkEnd);
        const cap = parseInt(bulkCapacity);

        if (isNaN(start) || isNaN(end) || start > end || start < 1) {
          throw new Error("Boshlang'ich va yakuniy raqamlar noto'g'ri.");
        }
        if (isNaN(cap) || cap < 1 || cap > 100) {
          throw new Error("Sig'im 1 dan 100 gacha bo'lishi kerak.");
        }

        for (let i = start; i <= end; i++) {
          tablesPayload.push({
            table_number: `${bulkPrefix}${i}`,
            capacity: cap,
            is_active: true
          });
        }
      } else {
        // Raw parsing (CSV like: table_number, capacity, notes)
        const lines = bulkRawText.split('\n');
        lines.forEach((line, idx) => {
          if (!line.trim()) return;
          const parts = line.split(',');
          if (parts.length < 2) {
            throw new Error(`${idx + 1}-qatorda xatolik: Stol raqami va sig'imi vergul bilan ajratilgan bo'lishi kerak.`);
          }
          const num = parts[0].trim();
          const cap = parseInt(parts[1].trim());
          const note = parts[2] ? parts[2].trim() : undefined;

          if (!num) {
            throw new Error(`${idx + 1}-qatorda xatolik: Stol raqami bo'sh bo'lmasligi kerak.`);
          }
          if (isNaN(cap) || cap < 1 || cap > 100) {
            throw new Error(`${idx + 1}-qatorda xatolik: Sig'im 1 dan 100 gacha bo'lishi kerak.`);
          }

          tablesPayload.push({
            table_number: num,
            capacity: cap,
            notes: note,
            is_active: true
          });
        });
      }

      if (tablesPayload.length === 0) {
        throw new Error("Import qilinadigan stollar topilmadi.");
      }

      const res = await tablesApi.bulkImportTables({ tables: tablesPayload });
      
      if (res.success) {
        setBulkSuccessMsg(`${res.created} ta stol muvaffaqiyatli import qilindi!`);
        setTimeout(() => {
          setIsBulkModalOpen(false);
          setBulkSuccessMsg(null);
          fetchTables();
        }, 1500);
      } else {
        setBulkError(res.message || "Import qilishda xatolik.");
      }
    } catch (err: any) {
      console.error("Bulk Import Error:", err);
      setBulkError(err.message || "Stollarni import qilishda kutilmagan xatolik.");
    } finally {
      setBulkSubmitting(false);
    }
  };

  // Filtered and Searched Tables List
  const filteredTables = (Array.isArray(tables) ? tables : []).filter(t => {
    const tableNumStr = String(t?.table_number || '');
    const matchesSearch = tableNumStr.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (t?.notes && String(t.notes).toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = statusFilter === 'ALL' || t?.status === statusFilter;
    
    let matchesActive = true;
    if (activeFilter === 'ACTIVE') {
      matchesActive = t?.is_active !== false;
    } else if (activeFilter === 'INACTIVE') {
      matchesActive = t?.is_active === false;
    }

    return matchesSearch && matchesStatus && matchesActive;
  });

  const getStatusBadge = (status: TableStatus) => {
    switch (status) {
      case 'AVAILABLE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.1)]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Mavjud
          </span>
        );
      case 'OCCUPIED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-[0_0_8px_rgba(244,67,54,0.1)] animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            Band qilingan
          </span>
        );
      case 'RESERVED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[0_0_8px_rgba(245,158,11,0.1)]">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Rezerv
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  return (
    <div className="space-y-3 font-Outfit text-slate-200">
      
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          {/* <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-2">
            Stollarni Boshqarish <Sparkles className="w-6 h-6 text-brand animate-pulse" />
          </h1>
          <p className="text-slate-400 text-sm">Muassasa zallaridagi stollar holatini boshqarish va buyurtma sozlamalari</p> */}
        </div>

        {isManagerOrOwner && (
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsBulkModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 border border-white/10 hover:bg-slate-800 text-slate-300 font-bold text-xs transition duration-200 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Bulk Import</span>
            </button>
            <button
              onClick={() => openCrudModal(null)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs shadow-lg shadow-brand/20 transition duration-200 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Stol Qo'shish</span>
            </button>
          </div>
        )}
      </div>

      {/* Info Warning banner for waiters */}
      {isWaiter && (
        <div className="flex gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm items-start">
          <Info className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Ofitsant rejimi:</span> Siz stollarni o'zgartira yoki yangilarini qo'sha olmaysiz. Bo'sh stolga bosib yangi buyurtma yarating, band stolga bosib esa mavjud buyurtmani boshqaring (mahsulot qo'shish, pre-chek, to'lov).
          </div>
        </div>
      )}

      {/* Filtering and Toolbar */}
      {/* <div className="p-4 rounded-2xl bg-darkCard border border-white/5 shadow-md space-y-4">
        <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
          
          <div className="relative w-full lg:max-w-md">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Stol raqami yoki izoh bo'yicha qidirish..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border border-white/5 focus:border-brand/40 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none transition duration-150"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-end">
            
            <div className="flex items-center gap-1.5 bg-slate-950/70 p-1 rounded-xl border border-white/5 text-xs font-semibold">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  statusFilter === 'ALL' ? 'bg-brand text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Barchasi
              </button>
              <button
                onClick={() => setStatusFilter('AVAILABLE')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  statusFilter === 'AVAILABLE' ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Bo'sh
              </button>
              <button
                onClick={() => setStatusFilter('OCCUPIED')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  statusFilter === 'OCCUPIED' ? 'bg-rose-500/10 text-rose-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Band
              </button>
              <button
                onClick={() => setStatusFilter('RESERVED')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  statusFilter === 'RESERVED' ? 'bg-amber-500/10 text-amber-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Rezerv
              </button>
            </div>

            {isManagerOrOwner && (
              <select
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value)}
                className="bg-slate-950/70 border border-white/5 focus:border-brand/40 text-slate-300 px-3 py-2 rounded-xl text-xs focus:outline-none transition"
              >
                <option value="ALL">Barcha holatdagilar</option>
                <option value="ACTIVE">Faqat Faollar</option>
                <option value="INACTIVE">Deaktivlar</option>
              </select>
            )}

            <div className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-xl border border-white/5">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition ${
                  viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Grid ko'rinishi"
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg transition ${
                  viewMode === 'list' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Ro'yxat ko'rinishi"
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={fetchTables}
              className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white transition cursor-pointer"
              title="Yangilash"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div> */}

      {/* Main Content Area */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-28 gap-4">
          <Loader2 className="w-10 h-10 text-brand animate-spin" />
          <p className="text-slate-400 text-sm font-semibold">Stollar ro'yxati yuklanmoqda...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 bg-rose-500/5 border border-rose-500/10 rounded-2xl p-6 text-center max-w-lg mx-auto">
          <AlertCircle className="w-12 h-12 text-rose-500 mb-3 animate-pulse" />
          <h4 className="font-bold text-white text-base mb-1">Xatolik yuz berdi</h4>
          <p className="text-sm text-slate-400 mb-4">{error}</p>
          <button
            onClick={fetchTables}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs transition cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Qayta urinish</span>
          </button>
        </div>
      ) : filteredTables.length > 0 ? (
        viewMode === 'grid' ? (
          
          /* Visual GRID View Layout */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
            {filteredTables.map((table) => {
              const borderGlow = ({
                AVAILABLE: 'hover:border-emerald-500/40 hover:shadow-emerald-500/5',
                OCCUPIED: 'hover:border-rose-500/40 hover:shadow-rose-500/5',
                RESERVED: 'hover:border-amber-500/40 hover:shadow-amber-500/5'
              } as Record<string, string>)[table.status || 'AVAILABLE'] || '';

              return (
                <div
                  key={table.uuid}
                  onClick={() => setOrderingTable(table)}
                  className={`relative p-5 rounded-2xl bg-darkCard/80 border cursor-pointer ${
                    table.is_active === false ? 'border-dashed border-white/5 opacity-55' : 'border-white/5'
                  } transition-all duration-300 group hover:-translate-y-1 hover:shadow-lg flex flex-col justify-between min-h-[175px] ${borderGlow}`}
                >

                  {/* Card top */}
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-black text-2xl text-white tracking-tight group-hover:text-brand transition duration-150">
                        {table.table_number}
                      </div>

                      {/* Display active status indicator (Manager option) */}
                      {isManagerOrOwner && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleActive(table); }}
                          className={`w-3.5 h-3.5 rounded-full border border-white/10 ${
                            table.is_active !== false
                              ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                              : 'bg-slate-700'
                          }`}
                          title={table.is_active !== false ? "Faol (Deaktiv qilish)" : "Nofaol (Faollashtirish)"}
                        />
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-slate-400 text-xs font-bold mt-1.5">
                      <Users className="w-3.5 h-3.5 shrink-0" />
                      <span>{table.capacity} kishi</span>
                    </div>

                    {table.current_order ? (
                      <p className="text-[11px] text-slate-400 mt-2 leading-relaxed font-medium">
                        {table.current_order.order_number} · {Number(table.current_order.total_price).toLocaleString('uz-UZ')} UZS
                      </p>
                    ) : table.notes && (
                      <p className="text-[11px] text-slate-500 line-clamp-2 mt-2 leading-relaxed font-medium">
                        {table.notes}
                      </p>
                    )}
                  </div>

                  {/* Card Bottom status + action buttons */}
                  <div className="mt-4 pt-3.5 border-t border-white/5 flex flex-col gap-2">
                    {getStatusBadge(table.status)}

                    {isManagerOrOwner && (
                      <div className="flex items-center justify-end gap-1.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <button
                          onClick={(e) => { e.stopPropagation(); openCrudModal(table); }}
                          className="p-1.5 rounded-lg bg-white/5 border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                          title="Tahrirlash"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteTable(table.uuid, table.table_number); }}
                          className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/10 text-rose-400 hover:text-white hover:bg-rose-500 transition cursor-pointer"
                          title="O'chirish (Deaktiv)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          
          /* Visual TABLE List Layout */
          <div className="p-6 rounded-2xl bg-darkCard border border-white/5 shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-slate-500 text-xs uppercase tracking-wider font-bold">
                    <th className="pb-3.5 pl-2">Stol Raqami</th>
                    <th className="pb-3.5">O'tirish joylari</th>
                    <th className="pb-3.5">Izoh / Tafsilotlar</th>
                    {isManagerOrOwner && <th className="pb-3.5 text-center">Tartib</th>}
                    <th className="pb-3.5 text-center">Holat</th>
                    {isManagerOrOwner && <th className="pb-3.5 text-center">Faol</th>}
                    {isManagerOrOwner && <th className="pb-3.5 text-right pr-2">Amallar</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-300">
                  {filteredTables.map((table) => (
                    <tr
                      key={table.uuid}
                      onClick={() => setOrderingTable(table)}
                      className={`hover:bg-white/[0.01] transition-colors cursor-pointer ${
                        table.is_active === false ? 'opacity-55 border-dashed' : ''
                      }`}
                    >
                      <td className="py-3.5 pl-2">
                        <div className="font-bold text-white text-base">{table.table_number}</div>
                        {table.current_order && (
                          <div className="text-[10px] text-slate-500 mt-0.5">{table.current_order.order_number}</div>
                        )}
                      </td>
                      <td className="py-3.5 font-semibold text-slate-200">
                        <span className="flex items-center gap-1"><Users className="w-4 h-4 text-slate-500" /> {table.capacity} kishi</span>
                      </td>
                      <td className="py-3.5 text-xs text-slate-400 max-w-xs truncate">
                        {table.notes || <span className="text-slate-600">-</span>}
                      </td>
                      {isManagerOrOwner && (
                        <td className="py-3.5 text-center text-slate-400 font-semibold">{table.display_order ?? 0}</td>
                      )}
                      <td className="py-3.5 text-center">
                        {getStatusBadge(table.status)}
                      </td>
                      {isManagerOrOwner && (
                        <td className="py-3.5 text-center">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleToggleActive(table); }}
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border transition ${
                              table.is_active !== false
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-slate-700/25 text-slate-500 border-slate-700/30'
                            }`}
                          >
                            {table.is_active !== false ? "FAOL" : "NOFAOL"}
                          </button>
                        </td>
                      )}
                      {isManagerOrOwner && (
                        <td className="py-3.5 text-right pr-2">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); openCrudModal(table); }}
                              className="p-1.5 rounded-lg bg-white/5 border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                              title="Tahrirlash"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteTable(table.uuid, table.table_number); }}
                              className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/10 text-rose-400 hover:text-white hover:bg-rose-500 transition cursor-pointer"
                              title="O'chirish"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-24 text-slate-500 bg-darkCard/50 border border-dashed border-white/5 rounded-2xl text-center">
          <HelpCircle className="w-14 h-14 stroke-[1] mb-3 text-slate-600" />
          <h3 className="font-bold text-white text-base mb-1">Stollar topilmadi</h3>
          <p className="text-sm text-slate-400 max-w-sm">Qidiruv shartlariga mos keladigan yoki yaratilgan stollar mavjud emas.</p>
          {isManagerOrOwner && (
            <button
              onClick={() => openCrudModal(null)}
              className="mt-4 flex items-center gap-1 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Yangi stol yaratish</span>
            </button>
          )}
        </div>
      )}

      {/* CRUD MODAL (ADD / EDIT) */}
      {isCrudModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-darkCard border border-white/10 rounded-2xl shadow-2xl p-6 relative overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand/5 rounded-bl-full pointer-events-none filter blur-xl" />
            
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              {selectedTable ? "Stol Ma'lumotlarini Tahrirlash" : "Yangi Stol Qo'shish"}
            </h3>

            {formError && (
              <div className="mb-4 flex gap-2.5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs items-center">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCrudSubmit} className="space-y-4">
              
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">Stol Nomi / Raqami *</label>
                <input
                  type="text"
                  required
                  placeholder="Masalan: 1, 5, VIP-2, A1"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-white/5 focus:border-brand/40 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none transition duration-150"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">O'tirish joyi (Sig'im) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="100"
                    placeholder="Masalan: 4"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-white/5 focus:border-brand/40 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none transition duration-150"
                  />
                </div>
                
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">Tartib raqami</label>
                  <input
                    type="number"
                    placeholder="Masalan: 5"
                    value={displayOrder}
                    onChange={(e) => setDisplayOrder(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-white/5 focus:border-brand/40 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none transition duration-150"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">Boshlang'ich Holat</label>
                <select
                  value={tableStatus}
                  onChange={(e) => setTableStatus(e.target.value as TableStatus)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-white/5 focus:border-brand/40 rounded-xl text-sm text-slate-300 focus:outline-none transition duration-150"
                >
                  <option value="AVAILABLE">Mavjud (Bo'sh)</option>
                  <option value="OCCUPIED">Band qilingan</option>
                  <option value="RESERVED">Rezerv qilingan</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">Izohlar / Joylashuvi</label>
                <textarea
                  placeholder="Masalan: Terassada, Deraza yonida, VIP xona"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-white/5 focus:border-brand/40 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none transition duration-150 resize-none"
                />
              </div>

              {/* Filial selection (Superadmin only) */}
              {partnerData?.role !== 'manager' && (
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">Bog'liq filial</label>
                  <select
                    value={filialUuid}
                    onChange={(e) => setFilialUuid(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-white/5 focus:border-brand/40 rounded-xl text-sm text-slate-300 focus:outline-none transition duration-150 cursor-pointer"
                  >
                    <option value="">-- Filialni tanlang --</option>
                    {filialList.map(f => (
                      <option key={f.uuid} value={f.uuid}>
                        {f.filial_name} {f.is_main ? "(Asosiy)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-between p-3.5 bg-slate-950 rounded-xl border border-white/5">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-slate-300">Faol holatda</span>
                  <span className="text-[10px] text-slate-500">Stol ofitsantlar ro'yxatida ko'rinadi</span>
                </div>
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 text-brand focus:ring-0 focus:ring-offset-0 rounded bg-slate-900 border-white/5 cursor-pointer"
                />
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-3 pt-3 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setIsCrudModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition duration-150 font-bold text-xs cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs shadow-lg shadow-brand/20 transition duration-150 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{selectedTable ? "Saqlash" : "Qo'shish"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BULK IMPORT MODAL */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-darkCard border border-white/10 rounded-2xl shadow-2xl p-6 relative overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-bl-full pointer-events-none filter blur-xl" />
            
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
              Ko'p miqdorda stol import qilish
            </h3>
            <p className="text-slate-400 text-xs mb-4">Tizimga bir vaqtning o'zida ko'plab stollarni tezkorlik bilan qo'shing</p>

            {bulkError && (
              <div className="mb-4 flex gap-2.5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs items-center">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{bulkError}</span>
              </div>
            )}

            {bulkSuccessMsg && (
              <div className="mb-4 flex gap-2.5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs items-center">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{bulkSuccessMsg}</span>
              </div>
            )}

            {/* Selection tabs for import method */}
            <div className="flex border-b border-white/5 mb-4 text-xs font-bold">
              <button
                onClick={() => setBulkMethod('generator')}
                className={`pb-2.5 px-4 border-b-2 transition ${
                  bulkMethod === 'generator' ? 'border-brand text-brand' : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Stollar generatori
              </button>
              <button
                onClick={() => setBulkMethod('raw')}
                className={`pb-2.5 px-4 border-b-2 transition ${
                  bulkMethod === 'raw' ? 'border-brand text-brand' : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Matn yordamida (CSV format)
              </button>
            </div>

            <form onSubmit={handleBulkSubmit} className="space-y-4">
              
              {bulkMethod === 'generator' ? (
                /* Method A: Generator */
                <div className="space-y-4">
                  <div className="p-3 bg-white/5 border border-white/5 rounded-xl text-[11px] text-slate-400 leading-relaxed">
                    <span className="font-bold text-white">Generator qanday ishlaydi:</span> Boshlang'ich sondan yakuniy songacha stollar ketma-ket yaratiladi. Masalan, Prefiks: <code className="text-brand">VIP-</code>, Boshlanishi: <code className="text-brand">1</code>, Yakuni: <code className="text-brand">3</code> bo'lsa, zaldagi stollar: <code className="text-slate-300">VIP-1, VIP-2, VIP-3</code> ko'rinishida qo'shiladi.
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">Stol Prefiksi</label>
                      <input
                        type="text"
                        placeholder="Masalan: VIP-"
                        value={bulkPrefix}
                        onChange={(e) => setBulkPrefix(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-950 border border-white/5 focus:border-brand/40 rounded-xl text-sm text-slate-200 focus:outline-none transition"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">Boshlanishi *</label>
                      <input
                        type="number"
                        required
                        min="1"
                        value={bulkStart}
                        onChange={(e) => setBulkStart(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-950 border border-white/5 focus:border-brand/40 rounded-xl text-sm text-slate-200 focus:outline-none transition"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">Yakuni *</label>
                      <input
                        type="number"
                        required
                        min="1"
                        value={bulkEnd}
                        onChange={(e) => setBulkEnd(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-950 border border-white/5 focus:border-brand/40 rounded-xl text-sm text-slate-200 focus:outline-none transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">Sig'im (Barcha stollar uchun) *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      max="100"
                      value={bulkCapacity}
                      onChange={(e) => setBulkCapacity(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-950 border border-white/5 focus:border-brand/40 rounded-xl text-sm text-slate-200 focus:outline-none transition"
                    />
                  </div>
                </div>
              ) : (
                /* Method B: Raw CSV like text area */
                <div className="space-y-4">
                  <div className="p-3 bg-white/5 border border-white/5 rounded-xl text-[11px] text-slate-400 leading-relaxed">
                    <span className="font-bold text-white">Format:</span> Har bir qatorga bittadan stol yozing, format: <code className="text-emerald-400">stol_nomi, sig'im, izoh(ixtiyoriy)</code> ko'rinishida bo'lsin.
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">Stollar ro'yxati *</label>
                    <textarea
                      required
                      rows={5}
                      value={bulkRawText}
                      onChange={(e) => setBulkRawText(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-950 border border-white/5 focus:border-brand/40 rounded-xl text-sm text-slate-200 placeholder-slate-700 focus:outline-none transition font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-3 pt-3 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition duration-150 font-bold text-xs cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={bulkSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs shadow-lg shadow-brand/20 transition duration-150 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {bulkSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Import qilish</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table Order Modal (Create new order / Manage active order) */}
      {orderingTable && (
        <TableOrderModal
          table={orderingTable}
          onClose={(refresh) => {
            setOrderingTable(null);
            if (refresh) {
              fetchTables();
            }
          }}
        />
      )}

    </div>
  );
};

export default TablesPage;
