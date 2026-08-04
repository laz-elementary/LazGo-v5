import React, { useState, useMemo, useEffect, useCallback } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import { TardinessRecord, TardinessCategory } from '../types';
import { PdfIcon, ExcelIcon, ExportIcon, SearchIcon, TagIcon, DownloadIcon } from './icons';
import { supabase } from '../services/supabase';

interface MonthlyReportProps {
  allRecords: TardinessRecord[];
  onDeleteRecord?: (id: string) => void;
  onRefresh?: () => Promise<void>;
  isRefreshing?: boolean;
}

type PickupTrackingRow = {
  id: string;
  created_at: string;
  tanggal: string;
  nama_siswa: string;
  kelas: string;
  jam_standar: string | null;
  jam_aktual: string | null;
  jam_input_awal: string | null;
  jam_dijemput: string | null;
  status_penjemputan: 'menunggu' | 'selesai' | null;
};

const getCurrentTimeValue = () => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
};

const getTodayDateKey = () => {
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
};

const timeToMinutes = (value: string | null | undefined) => {
  if (!value) return 0;
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number);
  return hours * 60 + minutes;
};

const getDurationMinutes = (
  start: string | null | undefined,
  end: string | null | undefined
) => Math.max(0, timeToMinutes(end) - timeToMinutes(start));

const getStudentKey = (name: string, className: string) =>
  `${(className || '').trim().toLocaleLowerCase('id-ID')}::${(name || '')
    .trim()
    .toLocaleLowerCase('id-ID')}`;


const getLocalDateKey = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
};

const getPickupTrackingKey = (
  date: string,
  name: string,
  className: string
) => `${date}::${getStudentKey(name, className)}`;

const sortPickupTrackingRows = (rows: PickupTrackingRow[]) =>
  [...rows].sort((a, b) => {
    const dateComparison = a.tanggal.localeCompare(b.tanggal);
    if (dateComparison !== 0) return dateComparison;

    const classComparison = (a.kelas || '').localeCompare(
      b.kelas || '',
      'id',
      { numeric: true, sensitivity: 'base' }
    );
    if (classComparison !== 0) return classComparison;

    const nameComparison = (a.nama_siswa || '').localeCompare(
      b.nama_siswa || '',
      'id',
      { sensitivity: 'base' }
    );
    if (nameComparison !== 0) return nameComparison;

    return (a.jam_input_awal || a.jam_aktual || '').localeCompare(
      b.jam_input_awal || b.jam_aktual || ''
    );
  });

const getPickupExportInfo = (
  row: PickupTrackingRow,
  currentTime: string
) => {
  const initialInputTime = row.jam_input_awal || row.jam_aktual;
  const pickupTime =
    row.jam_dijemput ||
    (row.status_penjemputan === 'selesai' ? row.jam_aktual : null);
  const isWaiting = row.status_penjemputan === 'menunggu' || !pickupTime;
  const isToday = row.tanggal === getTodayDateKey();

  const waitingMinutes = pickupTime
    ? getDurationMinutes(initialInputTime, pickupTime)
    : isToday
      ? getDurationMinutes(initialInputTime, currentTime)
      : null;

  const totalDelayMinutes = pickupTime
    ? getDurationMinutes(row.jam_standar, pickupTime)
    : isToday
      ? getDurationMinutes(row.jam_standar, currentTime)
      : getDurationMinutes(row.jam_standar, row.jam_aktual);

  return {
    initialInputTime: initialInputTime?.slice(0, 5) || '-',
    pickupTime: pickupTime?.slice(0, 5) || '-',
    waitingMinutes,
    totalDelayMinutes,
    statusLabel: isWaiting ? 'Masih menunggu' : 'Selesai dijemput',
    waitingLabel:
      waitingMinutes === null
        ? 'Belum ada jam dijemput'
        : `${waitingMinutes} mnt`,
    totalDelayLabel: isWaiting
      ? isToday
        ? `${totalDelayMinutes} mnt (berjalan)`
        : `Min. ${totalDelayMinutes} mnt`
      : `${totalDelayMinutes} mnt`,
  };
};

export const MonthlyReport: React.FC<MonthlyReportProps> = ({
  allRecords,
  onDeleteRecord,
  onRefresh,
  isRefreshing = false,
}) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedDailyDate, setSelectedDailyDate] = useState(() => {
  const today = new Date();

  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
});
  const [reportMode, setReportMode] =
  useState<'daily' | 'monthly'>('daily');

  // Filter state for separate records breakdown table
  const [recordSearch, setRecordSearch] = useState('');
  const [recordDateFilter, setRecordDateFilter] =
  useState('');
  const [classFilter, setClassFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'kedatangan' | 'kepulangan'>('all');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'duration-desc'>('date-desc');

  const [deleteConfirmRecord, setDeleteConfirmRecord] = useState<{ id: string; name: string } | null>(null);

  const [pickupTrackingRows, setPickupTrackingRows] = useState<PickupTrackingRow[]>([]);
  const [pickupEditTimes, setPickupEditTimes] = useState<Record<string, string>>({});
  const [isLoadingPickupTracking, setIsLoadingPickupTracking] = useState(false);
  const [savingPickupId, setSavingPickupId] = useState<string | null>(null);
  const [pickupUpdateMessage, setPickupUpdateMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [clockTick, setClockTick] = useState(Date.now());

  const monthNames = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];

  // Calculate available periods from history
  const availablePeriods = useMemo(() => {
    const periods = new Map<number, Set<number>>();
    // Include current year and month by default
    const now = new Date();
    periods.set(now.getFullYear(), new Set([now.getMonth()]));

    allRecords.forEach((rec) => {
      const date = new Date(rec.id);
      const year = date.getFullYear();
      const month = date.getMonth();
      if (!periods.has(year)) {
        periods.set(year, new Set());
      }
      periods.get(year)!.add(month);
    });
    return periods;
  }, [allRecords]);

  const availableYears = useMemo(
    () => Array.from(availablePeriods.keys()).sort((a, b) => Number(b) - Number(a)),
    [availablePeriods]
  );

  const availableMonths = useMemo(() => {
    return availablePeriods.has(selectedYear)
      ? Array.from(availablePeriods.get(selectedYear)!).sort((a, b) => Number(a) - Number(b))
      : [];
  }, [selectedYear, availablePeriods]);

  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);


  const reportFileName = `rekap_keterlambatan_${monthNames[selectedMonth]}_${selectedYear}`;

  // Filter records for the selected month and year
  const filteredRecordsForMonth = useMemo(() => {
    return allRecords.filter((rec) => {
      const recDate = new Date(rec.id);
      return recDate.getMonth() === selectedMonth && recDate.getFullYear() === selectedYear;
    });
  }, [allRecords, selectedMonth, selectedYear]);

  const sortedRecordsForExport = useMemo(() => {
  return [...filteredRecordsForMonth].sort((a, b) => {
    const classComparison = (a.className || '').localeCompare(
      b.className || '',
      'id',
      {
        numeric: true,
        sensitivity: 'base',
      }
    );

    if (classComparison !== 0) {
      return classComparison;
    }

    const nameComparison = (a.name || '').localeCompare(
      b.name || '',
      'id',
      {
        sensitivity: 'base',
      }
    );

    if (nameComparison !== 0) {
      return nameComparison;
    }

    const dateComparison =
      new Date(a.id).getTime() -
      new Date(b.id).getTime();

    if (dateComparison !== 0) {
      return dateComparison;
    }

    return (a.arrivalTime || '').localeCompare(
      b.arrivalTime || ''
    );
  });
}, [filteredRecordsForMonth]);

  const dailyRecordsForExport = useMemo(() => {
  const getLocalDateKey = (value: string) => {
    const date = new Date(value);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  };

  return allRecords
    .filter(
      (record) =>
        getLocalDateKey(record.id) === selectedDailyDate
    )
    .sort((a, b) => {
      const classComparison = (a.className || '').localeCompare(
        b.className || '',
        'id',
        {
          numeric: true,
          sensitivity: 'base',
        }
      );

      if (classComparison !== 0) {
        return classComparison;
      }

      const nameComparison = (a.name || '').localeCompare(
        b.name || '',
        'id',
        {
          sensitivity: 'base',
        }
      );

      if (nameComparison !== 0) {
        return nameComparison;
      }

      return (a.arrivalTime || '').localeCompare(
        b.arrivalTime || ''
      );
    });
}, [allRecords, selectedDailyDate]);

  const dailyArrivalRecords = useMemo(
    () => dailyRecordsForExport.filter((record) => record.tardinessType !== 'kepulangan'),
    [dailyRecordsForExport]
  );

  const dailyPickupRecords = useMemo(
    () => dailyRecordsForExport.filter((record) => record.tardinessType === 'kepulangan'),
    [dailyRecordsForExport]
  );

  const dailyStats = useMemo(() => {
    const totalMinutes = dailyRecordsForExport.reduce(
      (total, record) => total + record.durationMinutes,
      0
    );

    return {
      totalCount: dailyRecordsForExport.length,
      uniqueStudents: new Set(dailyRecordsForExport.map((record) => record.name)).size,
      arrivalCount: dailyArrivalRecords.length,
      pickupCount: dailyPickupRecords.length,
      totalMinutes,
    };
  }, [dailyRecordsForExport, dailyArrivalRecords, dailyPickupRecords]);

  // Jumlah keterlambatan setiap siswa pada bulan dari tanggal harian yang dipilih.
  const dailyMonthStudentFrequencyMap = useMemo(() => {
    const selectedDate = new Date(`${selectedDailyDate}T00:00:00`);
    const selectedDateMonth = selectedDate.getMonth();
    const selectedDateYear = selectedDate.getFullYear();
    const frequencyMap = new Map<string, number>();

    allRecords.forEach((record) => {
      const recordDate = new Date(record.id);

      if (
        recordDate.getMonth() !== selectedDateMonth ||
        recordDate.getFullYear() !== selectedDateYear
      ) {
        return;
      }

      const key = getStudentKey(record.name, record.className);
      frequencyMap.set(key, (frequencyMap.get(key) || 0) + 1);
    });

    return frequencyMap;
  }, [allRecords, selectedDailyDate]);

  const selectedDailyDateLabel = useMemo(
    () =>
      new Date(`${selectedDailyDate}T00:00:00`).toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    [selectedDailyDate]
  );


  const loadPickupTracking = useCallback(async () => {
    setIsLoadingPickupTracking(true);

    try {
      const { data, error } = await supabase
        .from('keterlambatan')
        .select(
          'id, created_at, tanggal, nama_siswa, kelas, jam_standar, jam_aktual, jam_input_awal, jam_dijemput, status_penjemputan'
        )
        .eq('tanggal', selectedDailyDate)
        .gte('jam_standar', '12:00')
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }

      const rows = (data ?? []) as PickupTrackingRow[];
      setPickupTrackingRows(rows);

      const defaultPickupTime = getCurrentTimeValue();
      setPickupEditTimes((previous) => {
        const next = { ...previous };
        rows.forEach((row) => {
          if (row.status_penjemputan === 'menunggu' && !next[row.id]) {
            next[row.id] = defaultPickupTime;
          }
        });
        return next;
      });
    } catch (error) {
      setPickupUpdateMessage({
        type: 'error',
        text:
          error instanceof Error
            ? `Monitoring penjemputan belum dapat dimuat: ${error.message}`
            : 'Monitoring penjemputan belum dapat dimuat.',
      });
    } finally {
      setIsLoadingPickupTracking(false);
    }
  }, [selectedDailyDate]);

  useEffect(() => {
    if (reportMode !== 'daily') return;

    void loadPickupTracking();
    const refreshInterval = window.setInterval(() => {
      void loadPickupTracking();
    }, 10000);

    return () => window.clearInterval(refreshInterval);
  }, [reportMode, loadPickupTracking]);

  useEffect(() => {
    const clockInterval = window.setInterval(() => {
      setClockTick(Date.now());
    }, 30000);

    return () => window.clearInterval(clockInterval);
  }, []);

  const currentClockTime = useMemo(
    () => getCurrentTimeValue(),
    [clockTick]
  );

  const waitingPickupCount = useMemo(
    () =>
      pickupTrackingRows.filter(
        (row) => row.status_penjemputan === 'menunggu'
      ).length,
    [pickupTrackingRows]
  );

  const handleCompletePickup = async (row: PickupTrackingRow) => {
    const pickupTime = pickupEditTimes[row.id] || getCurrentTimeValue();
    const initialInputTime = row.jam_input_awal || row.jam_aktual;

    if (!pickupTime) {
      setPickupUpdateMessage({
        type: 'error',
        text: 'Isi jam dijemput terlebih dahulu.',
      });
      return;
    }

    if (
      initialInputTime &&
      timeToMinutes(pickupTime) < timeToMinutes(initialInputTime)
    ) {
      setPickupUpdateMessage({
        type: 'error',
        text: `Jam dijemput ${row.nama_siswa} tidak boleh lebih awal daripada jam input ${initialInputTime.slice(0, 5)}.`,
      });
      return;
    }

    const totalDelay = getDurationMinutes(row.jam_standar, pickupTime);
    const category =
      totalDelay <= 5 ? 'Ringan' : totalDelay <= 15 ? 'Sedang' : 'Berat';

    setSavingPickupId(row.id);
    setPickupUpdateMessage(null);

    try {
      const { error } = await supabase
        .from('keterlambatan')
        .update({
          jam_aktual: pickupTime,
          jam_dijemput: pickupTime,
          status_penjemputan: 'selesai',
          kategori: category,
        })
        .eq('id', row.id);

      if (error) {
        throw error;
      }

      const waitingMinutes = getDurationMinutes(initialInputTime, pickupTime);
      setPickupUpdateMessage({
        type: 'success',
        text: `${row.nama_siswa} tercatat dijemput pukul ${pickupTime}. Waktu menunggu sejak diinput: ${waitingMinutes} menit.`,
      });

      await loadPickupTracking();
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error) {
      setPickupUpdateMessage({
        type: 'error',
        text:
          error instanceof Error
            ? `Gagal memperbarui jam penjemputan: ${error.message}`
            : 'Gagal memperbarui jam penjemputan.',
      });
    } finally {
      setSavingPickupId(null);
    }
  };

  // Additional detail view table filtering (search, class, category, type, sorting)
  const detailedRecords = useMemo(() => {
  const result = filteredRecordsForMonth.filter((rec) => {
    const recordDate = new Date(rec.id);

    const recordDateKey = [
      recordDate.getFullYear(),
      String(recordDate.getMonth() + 1).padStart(2, '0'),
      String(recordDate.getDate()).padStart(2, '0'),
    ].join('-');

    const matchesDate = recordDateFilter
      ? recordDateKey === recordDateFilter
      : true;

    const matchesSearch =
      rec.name
        .toLowerCase()
        .includes(recordSearch.toLowerCase()) ||
      Boolean(
        rec.reason &&
          rec.reason
            .toLowerCase()
            .includes(recordSearch.toLowerCase())
      );

    const matchesClass = classFilter
      ? rec.className === classFilter
      : true;

    const matchesCategory = categoryFilter
      ? rec.category === categoryFilter
      : true;

    const matchesType =
      typeFilter === 'all'
        ? true
        : typeFilter === 'kepulangan'
          ? rec.tardinessType === 'kepulangan'
          : rec.tardinessType !== 'kepulangan';

    return (
      matchesSearch &&
      matchesDate &&
      matchesClass &&
      matchesCategory &&
      matchesType
    );
  });

  result.sort((a, b) => {
    if (sortBy === 'date-desc') {
      return (
        new Date(b.id).getTime() -
        new Date(a.id).getTime()
      );
    }

    if (sortBy === 'date-asc') {
      return (
        new Date(a.id).getTime() -
        new Date(b.id).getTime()
      );
    }

    if (sortBy === 'duration-desc') {
      return b.durationMinutes - a.durationMinutes;
    }

    return 0;
  });

  return result;
}, [
  filteredRecordsForMonth,
  recordSearch,
  recordDateFilter,
  classFilter,
  categoryFilter,
  typeFilter,
  sortBy,
]);

  // Monthly statistics summary
  const monthlyStats = useMemo(() => {
    const totalCount = filteredRecordsForMonth.length;
    const totalMinutes = filteredRecordsForMonth.reduce((sum, r) => sum + r.durationMinutes, 0);
    const uniqueStudents = new Set(filteredRecordsForMonth.map((r) => r.name)).size;
    const avgMinutes = totalCount > 0 ? Math.round(totalMinutes / totalCount) : 0;
    const kedatanganCount = filteredRecordsForMonth.filter((r) => r.tardinessType !== 'kepulangan').length;
    const kepulanganCount = filteredRecordsForMonth.filter((r) => r.tardinessType === 'kepulangan').length;

    return { totalCount, totalMinutes, uniqueStudents, avgMinutes, kedatanganCount, kepulanganCount };
  }, [filteredRecordsForMonth]);

  // Rekap siswa yang terlambat berulang pada bulan yang dipilih.
  const monthlyStudentFrequencyMap = useMemo(() => {
    const frequencyMap = new Map<
      string,
      {
        name: string;
        className: string;
        totalCount: number;
        arrivalCount: number;
        pickupCount: number;
      }
    >();

    filteredRecordsForMonth.forEach((record) => {
      const key = getStudentKey(record.name, record.className);
      const current = frequencyMap.get(key) || {
        name: record.name,
        className: record.className,
        totalCount: 0,
        arrivalCount: 0,
        pickupCount: 0,
      };

      current.totalCount += 1;

      if (record.tardinessType === 'kepulangan') {
        current.pickupCount += 1;
      } else {
        current.arrivalCount += 1;
      }

      frequencyMap.set(key, current);
    });

    return frequencyMap;
  }, [filteredRecordsForMonth]);

  const repeatedStudentAlerts = useMemo(
    () =>
      Array.from(monthlyStudentFrequencyMap.values())
        .filter((student) => student.totalCount > 1)
        .sort((a, b) => {
          if (b.totalCount !== a.totalCount) {
            return b.totalCount - a.totalCount;
          }

          const classComparison = a.className.localeCompare(b.className, 'id', {
            numeric: true,
            sensitivity: 'base',
          });

          if (classComparison !== 0) {
            return classComparison;
          }

          return a.name.localeCompare(b.name, 'id', { sensitivity: 'base' });
        }),
    [monthlyStudentFrequencyMap]
  );


  const getMonthlyFrequency = (record: TardinessRecord) =>
    monthlyStudentFrequencyMap.get(
      getStudentKey(record.name, record.className)
    )?.totalCount ?? 1;

  const getRepeatAlertStatus = (count: number) => {
    if (count > 3) {
      return 'NOTIFIKASI (>3x)';
    }

    if (count > 1) {
      return 'PERHATIAN (2-3x)';
    }

    return '-';
  };

  // Chart 1: Daily Trend Data
  const dailyTrendData = useMemo(() => {
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const daysMap: { [key: number]: { dateLabel: string; Kedatangan: number; Kepulangan: number; Total: number } } = {};

    for (let d = 1; d <= daysInMonth; d++) {
      daysMap[d] = { dateLabel: `${d}`, Kedatangan: 0, Kepulangan: 0, Total: 0 };
    }

    filteredRecordsForMonth.forEach((rec) => {
      const dayNum = new Date(rec.id).getDate();
      if (daysMap[dayNum]) {
        if (rec.tardinessType === 'kepulangan') {
          daysMap[dayNum].Kepulangan += 1;
        } else {
          daysMap[dayNum].Kedatangan += 1;
        }
        daysMap[dayNum].Total += 1;
      }
    });

    return Object.values(daysMap);
  }, [filteredRecordsForMonth, selectedMonth, selectedYear]);

  // Chart 2: Tardiness count per Class
  const classChartData = useMemo(() => {
    const classMap: { [key: string]: { className: string; Kedatangan: number; Kepulangan: number; Total: number } } = {};

    filteredRecordsForMonth.forEach((rec) => {
      const cls = rec.className || 'Lainnya';
      if (!classMap[cls]) {
        classMap[cls] = { className: cls, Kedatangan: 0, Kepulangan: 0, Total: 0 };
      }
      if (rec.tardinessType === 'kepulangan') {
        classMap[cls].Kepulangan += 1;
      } else {
        classMap[cls].Kedatangan += 1;
      }
      classMap[cls].Total += 1;
    });

    return Object.values(classMap).sort((a, b) => a.className.localeCompare(b.className));
  }, [filteredRecordsForMonth]);

  // Chart 3: Category breakdown pie chart
  const categoryPieData = useMemo(() => {
    const categoryMap: { [key: string]: number } = {};
    filteredRecordsForMonth.forEach((rec) => {
      const cat = rec.category || 'Lain-lain';
      categoryMap[cat] = (categoryMap[cat] || 0) + 1;
    });

    const PIE_COLORS = ['#0284c7', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#64748b'];

    return Object.entries(categoryMap).map(([name, value], idx) => ({
      name,
      value,
      color: PIE_COLORS[idx % PIE_COLORS.length],
    }));
  }, [filteredRecordsForMonth]);

  // Class list for dropdown filter
  const monthlyClassOptions = useMemo(() => {
    return Array.from(new Set(filteredRecordsForMonth.map((r) => r.className))).sort();
  }, [filteredRecordsForMonth]);

  const fetchPickupRowsForExport = async (
    startDate: string,
    endDate: string
  ): Promise<PickupTrackingRow[]> => {
    const { data, error } = await supabase
      .from('keterlambatan')
      .select(
        'id, created_at, tanggal, nama_siswa, kelas, jam_standar, jam_aktual, jam_input_awal, jam_dijemput, status_penjemputan'
      )
      .gte('tanggal', startDate)
      .lte('tanggal', endDate)
      .gte('jam_standar', '12:00')
      .order('tanggal', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    return sortPickupTrackingRows((data ?? []) as PickupTrackingRow[]);
  };

  const getPickupRowMap = (rows: PickupTrackingRow[]) => {
    const map = new Map<string, PickupTrackingRow>();

    rows.forEach((row) => {
      map.set(
        getPickupTrackingKey(row.tanggal, row.nama_siswa, row.kelas),
        row
      );
    });

    return map;
  };

  const handleExportCSV = async () => {
    if (filteredRecordsForMonth.length === 0) {
      alert('Tidak ada data untuk diekspor pada bulan ini.');
      return;
    }

    try {
      const monthStart = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      const monthEnd = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      const pickupRows = await fetchPickupRowsForExport(monthStart, monthEnd);
      const pickupRowMap = getPickupRowMap(pickupRows);
      const currentTime = getCurrentTimeValue();

      const headers = [
        'ID',
        'Tanggal',
        'Jenis',
        'Jam Datang/Jemput',
        'Jam Standar',
        'Jam Input Awal',
        'Jam Dijemput Aktual',
        'Menunggu Sejak Input',
        'Status Penjemputan',
        'Nama Siswa',
        'Kelas',
        'Durasi Terlambat (mnt)',
        'Kategori',
        'Alasan',
        'Frekuensi Bulan Ini',
        'Status Alert',
      ];

      const csvContent = [
        headers.join(','),
        ...sortedRecordsForExport.map((record) => {
          const monthlyCount = getMonthlyFrequency(record);
          const recordDateKey = getLocalDateKey(record.id);
          const pickupRow =
            record.tardinessType === 'kepulangan'
              ? pickupRowMap.get(
                  getPickupTrackingKey(
                    recordDateKey,
                    record.name,
                    record.className
                  )
                )
              : undefined;
          const pickupInfo = pickupRow
            ? getPickupExportInfo(pickupRow, currentTime)
            : null;

          return [
            `"${record.id}"`,
            `"${new Date(record.id).toLocaleDateString('id-ID')}"`,
            `"${record.tardinessType === 'kepulangan' ? 'Kepulangan' : 'Kedatangan'}"`,
            `"${record.arrivalTime}"`,
            `"${record.schoolStartTime || (record.tardinessType === 'kepulangan' ? '14:00' : '07:30')}"`,
            `"${pickupInfo?.initialInputTime || ''}"`,
            `"${pickupInfo?.pickupTime === '-' ? '' : pickupInfo?.pickupTime || ''}"`,
            `"${pickupInfo?.waitingLabel || ''}"`,
            `"${pickupInfo?.statusLabel || ''}"`,
            `"${record.name}"`,
            `"${record.className}"`,
            record.durationMinutes,
            `"${record.category}"`,
            `"${(record.reason || '').replace(/"/g, '""')}"`,
            `"${monthlyCount}x"`,
            `"${getRepeatAlertStatus(monthlyCount)}"`,
          ].join(',');
        }),
      ].join('\n');

      const blob = new Blob([`\uFEFF${csvContent}`], {
        type: 'text/csv;charset=utf-8;',
      });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${reportFileName}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Gagal menyiapkan CSV monitoring penjemputan:', error);
      alert('Gagal memuat data monitoring penjemputan untuk CSV.');
    }
  };

  const handleExportXLSX = async () => {
    if (filteredRecordsForMonth.length === 0) {
      alert('Tidak ada data untuk diekspor pada bulan ini.');
      return;
    }

    try {
      const monthStart = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      const monthEnd = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      const pickupRows = await fetchPickupRowsForExport(monthStart, monthEnd);
      const pickupRowMap = getPickupRowMap(pickupRows);
      const currentTime = getCurrentTimeValue();

      const dataToExport = sortedRecordsForExport.map((record) => {
        const monthlyCount = getMonthlyFrequency(record);
        const recordDateKey = getLocalDateKey(record.id);
        const pickupRow =
          record.tardinessType === 'kepulangan'
            ? pickupRowMap.get(
                getPickupTrackingKey(
                  recordDateKey,
                  record.name,
                  record.className
                )
              )
            : undefined;
        const pickupInfo = pickupRow
          ? getPickupExportInfo(pickupRow, currentTime)
          : null;

        return {
          Tanggal: new Date(record.id).toLocaleDateString('id-ID'),
          Jenis:
            record.tardinessType === 'kepulangan'
              ? 'Kepulangan'
              : 'Kedatangan',
          'Jam Realisasi': record.arrivalTime,
          'Jam Standar':
            record.schoolStartTime ||
            (record.tardinessType === 'kepulangan' ? '14:00' : '07:30'),
          'Jam Input Awal': pickupInfo?.initialInputTime || '',
          'Jam Dijemput Aktual':
            pickupInfo?.pickupTime === '-'
              ? ''
              : pickupInfo?.pickupTime || '',
          'Menunggu Sejak Input': pickupInfo?.waitingLabel || '',
          'Status Penjemputan': pickupInfo?.statusLabel || '',
          'Nama Siswa': record.name,
          Kelas: record.className,
          'Durasi Terlambat (menit)': record.durationMinutes,
          Kategori: record.category,
          Alasan: record.reason || '',
          'Frekuensi Bulan Ini': `${monthlyCount}x`,
          'Status Alert': getRepeatAlertStatus(monthlyCount),
        };
      });

      const repeatedSummary = repeatedStudentAlerts.map((student) => ({
        'Nama Siswa': student.name,
        Kelas: student.className,
        'Total Terlambat': `${student.totalCount}x`,
        Kedatangan: `${student.arrivalCount}x`,
        Kepulangan: `${student.pickupCount}x`,
        Status: getRepeatAlertStatus(student.totalCount),
      }));

      const pickupMonitoringSummary = pickupRows.map((row) => {
        const pickupInfo = getPickupExportInfo(row, currentTime);

        return {
          Tanggal: new Date(`${row.tanggal}T00:00:00`).toLocaleDateString(
            'id-ID'
          ),
          'Nama Siswa': row.nama_siswa,
          Kelas: row.kelas,
          'Jam Pulang Standar': row.jam_standar?.slice(0, 5) || '-',
          'Jam Input Awal': pickupInfo.initialInputTime,
          'Jam Dijemput Aktual':
            pickupInfo.pickupTime === '-' ? '' : pickupInfo.pickupTime,
          'Menunggu Sejak Input': pickupInfo.waitingLabel,
          'Total Keterlambatan': pickupInfo.totalDelayLabel,
          'Status Penjemputan': pickupInfo.statusLabel,
        };
      });

      const workbook = XLSX.utils.book_new();
      const detailWorksheet = XLSX.utils.json_to_sheet(dataToExport);
      XLSX.utils.book_append_sheet(
        workbook,
        detailWorksheet,
        'Keterlambatan Bulanan'
      );

      if (pickupMonitoringSummary.length > 0) {
        const pickupWorksheet =
          XLSX.utils.json_to_sheet(pickupMonitoringSummary);
        XLSX.utils.book_append_sheet(
          workbook,
          pickupWorksheet,
          'Monitoring Penjemputan'
        );
      }

      if (repeatedSummary.length > 0) {
        const alertWorksheet = XLSX.utils.json_to_sheet(repeatedSummary);
        XLSX.utils.book_append_sheet(
          workbook,
          alertWorksheet,
          'Alert Siswa Berulang'
        );
      }

      XLSX.writeFile(workbook, `${reportFileName}.xlsx`);
    } catch (error) {
      console.error('Gagal menyiapkan Excel monitoring penjemputan:', error);
      alert('Gagal memuat data monitoring penjemputan untuk Excel.');
    }
  };

  const handleExportPDF = async () => {
    if (filteredRecordsForMonth.length === 0) {
      alert('Tidak ada data untuk diekspor pada bulan ini.');
      return;
    }

    try {
      const monthStart = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      const monthEnd = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      const pickupRows = await fetchPickupRowsForExport(monthStart, monthEnd);
      const currentTime = getCurrentTimeValue();

      const doc = new jsPDF({ orientation: 'landscape' });

      doc.setFontSize(16);
      doc.text('Rekap Laporan Keterlambatan Siswa Bulanan', 14, 18);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Periode: ${monthNames[selectedMonth]} ${selectedYear}`, 14, 25);

      doc.setFontSize(9);
      doc.setTextColor(60);
      doc.text(
        `Total: ${monthlyStats.totalCount}x (Kedatangan: ${monthlyStats.kedatanganCount}x, Kepulangan: ${monthlyStats.kepulanganCount}x) | Total Durasi: ${monthlyStats.totalMinutes} mnt`,
        14,
        32
      );

      let posisiY = 40;
      doc.setTextColor(0);

      if (repeatedStudentAlerts.length > 0) {
        doc.setFontSize(11);
        doc.text('Catatan Siswa Terlambat Berulang', 14, posisiY);

        autoTable(doc, {
          head: [[
            'Nama Siswa',
            'Kelas',
            'Total',
            'Kedatangan',
            'Kepulangan',
            'Status',
          ]],
          body: repeatedStudentAlerts.map((student) => [
            student.name,
            student.className,
            `${student.totalCount}x`,
            `${student.arrivalCount}x`,
            `${student.pickupCount}x`,
            getRepeatAlertStatus(student.totalCount),
          ]),
          startY: posisiY + 4,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [217, 119, 6] },
        });

        posisiY =
          ((doc as any).lastAutoTable?.finalY ?? posisiY + 4) + 10;
      }

      const tableColumn = [
        'Tanggal',
        'Jam',
        'Nama Siswa',
        'Kelas',
        'Durasi',
        'Kategori',
        'Alasan',
        'Frekuensi',
        'Status Alert',
      ];

      const buatBarisBulanan = (records: TardinessRecord[]) =>
        records.map((record) => {
          const monthlyCount = getMonthlyFrequency(record);

          return [
            new Date(record.id).toLocaleDateString('id-ID'),
            record.arrivalTime,
            record.name,
            record.className,
            `${record.durationMinutes} mnt`,
            record.category,
            record.reason || '-',
            `${monthlyCount}x`,
            getRepeatAlertStatus(monthlyCount),
          ];
        });

      const kedatanganBulanan = sortedRecordsForExport.filter(
        (record) => record.tardinessType !== 'kepulangan'
      );

      const kepulanganBulanan = sortedRecordsForExport.filter(
        (record) => record.tardinessType === 'kepulangan'
      );

      if (kedatanganBulanan.length > 0) {
        if (posisiY > 175) {
          doc.addPage();
          posisiY = 18;
        }

        doc.setFontSize(11);
        doc.text('A. Keterlambatan Kedatangan', 14, posisiY);

        autoTable(doc, {
          head: [tableColumn],
          body: buatBarisBulanan(kedatanganBulanan),
          startY: posisiY + 4,
          styles: { fontSize: 7 },
          headStyles: { fillColor: [14, 116, 144] },
          columnStyles: {
            6: { cellWidth: 45 },
            8: { cellWidth: 31 },
          },
        });

        posisiY =
          ((doc as any).lastAutoTable?.finalY ?? posisiY + 4) + 10;
      }

      if (kepulanganBulanan.length > 0) {
        if (posisiY > 175) {
          doc.addPage();
          posisiY = 18;
        }

        doc.setFontSize(11);
        doc.setTextColor(0);
        doc.text('B. Keterlambatan Penjemputan/Kepulangan', 14, posisiY);

        autoTable(doc, {
          head: [tableColumn],
          body: buatBarisBulanan(kepulanganBulanan),
          startY: posisiY + 4,
          styles: { fontSize: 7 },
          headStyles: { fillColor: [14, 116, 144] },
          columnStyles: {
            6: { cellWidth: 45 },
            8: { cellWidth: 31 },
          },
        });

        posisiY =
          ((doc as any).lastAutoTable?.finalY ?? posisiY + 4) + 10;
      }

      if (pickupRows.length > 0) {
        if (posisiY > 155) {
          doc.addPage();
          posisiY = 18;
        }

        doc.setFontSize(11);
        doc.setTextColor(0);
        doc.text('C. Rekap Monitoring Penjemputan', 14, posisiY);

        autoTable(doc, {
          head: [[
            'Tanggal',
            'Nama Siswa',
            'Kelas',
            'Jam Pulang',
            'Dicatat Belum Dijemput',
            'Jam Dijemput',
            'Menunggu Sejak Dicatat',
            'Total dari Jam Pulang',
            'Status',
          ]],
          body: pickupRows.map((row) => {
            const pickupInfo = getPickupExportInfo(row, currentTime);

            return [
              new Date(`${row.tanggal}T00:00:00`).toLocaleDateString(
                'id-ID'
              ),
              row.nama_siswa,
              row.kelas,
              row.jam_standar?.slice(0, 5) || '-',
              pickupInfo.initialInputTime,
              pickupInfo.pickupTime,
              pickupInfo.waitingLabel,
              pickupInfo.totalDelayLabel,
              pickupInfo.statusLabel,
            ];
          }),
          startY: posisiY + 4,
          styles: { fontSize: 7 },
          headStyles: { fillColor: [124, 58, 237] },
          columnStyles: {
            1: { cellWidth: 38 },
            6: { cellWidth: 31 },
            8: { cellWidth: 28 },
          },
        });
      }

      doc.save(`${reportFileName}.pdf`);
    } catch (error) {
      console.error('Gagal membuat PDF bulanan:', error);
      alert('Gagal memuat data monitoring penjemputan untuk PDF.');
    }
  };

  const handleExportDailyPDF = async () => {
    try {
      const latestPickupRows = await fetchPickupRowsForExport(
        selectedDailyDate,
        selectedDailyDate
      );

      if (
        dailyRecordsForExport.length === 0 &&
        latestPickupRows.length === 0
      ) {
        alert('Tidak ada data keterlambatan pada tanggal yang dipilih.');
        return;
      }

      const doc = new jsPDF({
        orientation: 'landscape',
      });

      const formattedDate = new Date(
        `${selectedDailyDate}T00:00:00`
      ).toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

      const kedatanganCount = dailyRecordsForExport.filter(
        (record) => record.tardinessType !== 'kepulangan'
      ).length;

      const kepulanganCount = dailyRecordsForExport.filter(
        (record) => record.tardinessType === 'kepulangan'
      ).length;

      const totalMinutes = dailyRecordsForExport.reduce(
        (total, record) => total + record.durationMinutes,
        0
      );

      doc.setFontSize(16);
      doc.text(
        'Rekap Laporan Keterlambatan Siswa Harian',
        14,
        18
      );

      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Tanggal: ${formattedDate}`, 14, 25);

      doc.setFontSize(9);
      doc.setTextColor(60);
      doc.text(
        `Total: ${dailyRecordsForExport.length}x | Kedatangan: ${kedatanganCount}x | Kepulangan: ${kepulanganCount}x | Total Durasi: ${totalMinutes} menit`,
        14,
        32
      );

      const tableColumns = [
        'Jam Realisasi',
        'Jam Standar',
        'Nama Siswa',
        'Kelas',
        'Durasi',
        'Kategori',
        'Alasan',
      ];

      const buatBarisHarian = (records: TardinessRecord[]) =>
        records.map((record) => [
          record.arrivalTime,
          record.schoolStartTime ||
            (record.tardinessType === 'kepulangan'
              ? '14:00'
              : '07:30'),
          record.name,
          record.className,
          `${record.durationMinutes} mnt`,
          record.category,
          record.reason || '-',
        ]);

      const kedatanganHarian = dailyRecordsForExport.filter(
        (record) => record.tardinessType !== 'kepulangan'
      );

      const kepulanganHarian = dailyRecordsForExport.filter(
        (record) => record.tardinessType === 'kepulangan'
      );

      let posisiY = 38;
      doc.setTextColor(0);

      if (kedatanganHarian.length > 0) {
        doc.setFontSize(11);
        doc.text('A. Keterlambatan Kedatangan', 14, posisiY);

        autoTable(doc, {
          head: [tableColumns],
          body: buatBarisHarian(kedatanganHarian),
          startY: posisiY + 4,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [14, 116, 144] },
        });

        posisiY =
          ((doc as any).lastAutoTable?.finalY ?? posisiY + 4) + 10;
      }

      if (kepulanganHarian.length > 0) {
        if (posisiY > 175) {
          doc.addPage();
          posisiY = 18;
        }

        doc.setFontSize(11);
        doc.setTextColor(0);
        doc.text(
          'B. Keterlambatan Penjemputan/Kepulangan',
          14,
          posisiY
        );

        autoTable(doc, {
          head: [tableColumns],
          body: buatBarisHarian(kepulanganHarian),
          startY: posisiY + 4,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [14, 116, 144] },
        });

        posisiY =
          ((doc as any).lastAutoTable?.finalY ?? posisiY + 4) + 10;
      }

      if (latestPickupRows.length > 0) {
        if (posisiY > 150) {
          doc.addPage();
          posisiY = 18;
        }

        const currentTime = getCurrentTimeValue();

        doc.setFontSize(11);
        doc.setTextColor(0);
        doc.text('C. Monitoring Penjemputan Siswa', 14, posisiY);

        autoTable(doc, {
          head: [[
            'Nama Siswa',
            'Kelas',
            'Jam Pulang',
            'Dicatat Belum Dijemput',
            'Jam Dijemput',
            'Menunggu Sejak Dicatat',
            'Total dari Jam Pulang',
            'Status',
          ]],
          body: latestPickupRows.map((row) => {
            const pickupInfo = getPickupExportInfo(row, currentTime);

            return [
              row.nama_siswa,
              row.kelas,
              row.jam_standar?.slice(0, 5) || '-',
              pickupInfo.initialInputTime,
              pickupInfo.pickupTime,
              pickupInfo.waitingLabel,
              pickupInfo.totalDelayLabel,
              pickupInfo.statusLabel,
            ];
          }),
          startY: posisiY + 4,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [124, 58, 237] },
          columnStyles: {
            0: { cellWidth: 42 },
            5: { cellWidth: 35 },
            7: { cellWidth: 30 },
          },
        });
      }

      doc.save(
        `rekap_keterlambatan_harian_${selectedDailyDate}.pdf`
      );
    } catch (error) {
      console.error('Gagal membuat PDF harian:', error);
      alert('Gagal memuat data monitoring penjemputan untuk PDF harian.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Submenu Laporan */}
<div className="flex justify-center">
  <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm dark:border-gray-700 dark:bg-gray-800">
    <button
      type="button"
      onClick={() => setReportMode('daily')}
      className={`rounded-lg px-5 py-2 text-sm font-semibold transition-colors ${
        reportMode === 'daily'
          ? 'bg-sky-600 text-white'
          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
      }`}
    >
      Rekap Harian
    </button>

    <button
      type="button"
      onClick={() => setReportMode('monthly')}
      className={`rounded-lg px-5 py-2 text-sm font-semibold transition-colors ${
        reportMode === 'monthly'
          ? 'bg-sky-600 text-white'
          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
      }`}
    >
      Rekap Bulanan
    </button>
  </div>
</div>
      {reportMode === 'daily' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-md dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-5 flex flex-col gap-3 border-b pb-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Rekap Laporan Harian
                </h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {selectedDailyDateLabel}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {onRefresh && (
                  <button
                    type="button"
                    onClick={() => void onRefresh()}
                    disabled={isRefreshing}
                    className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isRefreshing ? 'Memperbarui...' : '↻ Refresh Data'}
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleExportDailyPDF}
                  disabled={dailyRecordsForExport.length === 0}
                  className="flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <PdfIcon className="h-4 w-4" />
                  Unduh PDF Harian
                </button>
              </div>
            </div>

            <div className="mb-5 max-w-sm">
              <label
                htmlFor="daily-date"
                className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400"
              >
                Pilih Tanggal
              </label>
              <input
                id="daily-date"
                type="date"
                value={selectedDailyDate}
                onChange={(event) => setSelectedDailyDate(event.target.value)}
                className="block w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700">
                <p className="text-[11px] text-gray-500 dark:text-gray-400">Total Catatan</p>
                <p className="mt-1 text-xl font-bold text-sky-600 dark:text-sky-400">{dailyStats.totalCount}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700">
                <p className="text-[11px] text-gray-500 dark:text-gray-400">Siswa Berbeda</p>
                <p className="mt-1 text-xl font-bold text-indigo-600 dark:text-indigo-400">{dailyStats.uniqueStudents}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700">
                <p className="text-[11px] text-gray-500 dark:text-gray-400">Kedatangan</p>
                <p className="mt-1 text-xl font-bold text-sky-600 dark:text-sky-400">{dailyStats.arrivalCount}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700">
                <p className="text-[11px] text-gray-500 dark:text-gray-400">Kepulangan</p>
                <p className="mt-1 text-xl font-bold text-amber-600 dark:text-amber-400">{dailyStats.pickupCount}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700">
                <p className="text-[11px] text-gray-500 dark:text-gray-400">Total Durasi</p>
                <p className="mt-1 text-xl font-bold text-teal-600 dark:text-teal-400">{dailyStats.totalMinutes} mnt</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-white p-5 shadow-md dark:border-amber-900/60 dark:bg-gray-800">
            <div className="mb-4 flex flex-col gap-3 border-b border-gray-200 pb-4 dark:border-gray-700 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    Monitoring Penjemputan Siswa
                  </h3>
                  {waitingPickupCount > 0 && (
                    <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-bold text-rose-700 dark:bg-rose-900/50 dark:text-rose-300">
                      {waitingPickupCount} masih menunggu
                    </span>
                  )}
                </div>
                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  Data kepulangan yang baru diinput otomatis berstatus <strong>Masih Menunggu</strong>. Saat siswa dijemput, isi jam aktual lalu klik <strong>Simpan Dijemput</strong>. Sistem menyimpan jam input awal, jam dijemput, serta lama menunggu.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void loadPickupTracking()}
                disabled={isLoadingPickupTracking}
                className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/40"
              >
                {isLoadingPickupTracking ? 'Memuat...' : '↻ Refresh Monitoring'}
              </button>
            </div>

            {pickupUpdateMessage && (
              <div
                className={`mb-4 rounded-lg border px-3 py-2 text-xs font-medium ${
                  pickupUpdateMessage.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300'
                    : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300'
                }`}
              >
                {pickupUpdateMessage.text}
              </div>
            )}

            {pickupTrackingRows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 px-4 py-7 text-center text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                Belum ada data kepulangan pada tanggal ini.
              </div>
            ) : (
              <div className="max-h-[460px] overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full min-w-[1050px] text-left text-xs text-gray-700 dark:text-gray-300">
                  <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-3 py-2">Nama Siswa</th>
                      <th className="px-3 py-2">Kelas</th>
                      <th className="px-3 py-2">Jam Pulang</th>
                      <th className="px-3 py-2">Dicatat Belum Dijemput</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Menunggu Sejak Input</th>
                      <th className="px-3 py-2">Total Terlambat</th>
                      <th className="px-3 py-2">Jam Dijemput / Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {pickupTrackingRows.map((row) => {
                      const isWaiting = row.status_penjemputan === 'menunggu';
                      const initialInputTime = row.jam_input_awal || row.jam_aktual;
                      const pickupTime = row.jam_dijemput || (!isWaiting ? row.jam_aktual : null);
                      const isToday = selectedDailyDate === getTodayDateKey();
                      const waitingMinutes = pickupTime
                        ? getDurationMinutes(initialInputTime, pickupTime)
                        : isToday
                          ? getDurationMinutes(initialInputTime, currentClockTime)
                          : null;
                      const totalDelay = pickupTime
                        ? getDurationMinutes(row.jam_standar, pickupTime)
                        : isToday
                          ? getDurationMinutes(row.jam_standar, currentClockTime)
                          : getDurationMinutes(row.jam_standar, initialInputTime);
                      const alertClass =
                        totalDelay >= 30
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300'
                          : totalDelay >= 20
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
                            : 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300';

                      return (
                        <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="px-3 py-2 font-semibold text-gray-900 dark:text-white">{row.nama_siswa}</td>
                          <td className="whitespace-nowrap px-3 py-2">{row.kelas}</td>
                          <td className="whitespace-nowrap px-3 py-2">{row.jam_standar?.slice(0, 5) || '-'}</td>
                          <td className="whitespace-nowrap px-3 py-2 font-semibold text-amber-600 dark:text-amber-400">
                            {initialInputTime?.slice(0, 5) || '-'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {isWaiting ? (
                              <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${alertClass}`}>
                                {totalDelay >= 30 ? '🔴 Melebihi 30 Menit' : totalDelay >= 20 ? '⚠️ Lebih dari 20 Menit' : 'Menunggu'}
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                                ✓ Selesai
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 font-semibold">
                            {waitingMinutes === null ? 'Belum diselesaikan' : `${waitingMinutes} menit`}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${alertClass}`}>
                              {totalDelay} menit
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {isWaiting ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="time"
                                  value={pickupEditTimes[row.id] || currentClockTime}
                                  onChange={(event) =>
                                    setPickupEditTimes((previous) => ({
                                      ...previous,
                                      [row.id]: event.target.value,
                                    }))
                                  }
                                  className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                />
                                <button
                                  type="button"
                                  onClick={() => void handleCompletePickup(row)}
                                  disabled={savingPickupId === row.id}
                                  className="whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {savingPickupId === row.id ? 'Menyimpan...' : 'Simpan Dijemput'}
                                </button>
                              </div>
                            ) : (
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                Dijemput {pickupTime?.slice(0, 5) || '-'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {dailyRecordsForExport.length === 0 ? (
            <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-500 shadow-md dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
              Belum ada data pada tanggal yang dipilih.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-md dark:border-gray-700 dark:bg-gray-800">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white">A. Keterlambatan Kedatangan</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{dailyArrivalRecords.length} catatan</p>
                  </div>
                </div>

                <div className="max-h-[420px] overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
                  <table className="w-full min-w-[760px] text-left text-xs text-gray-700 dark:text-gray-300">
                    <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-3 py-2">Jam Datang</th>
                        <th className="px-3 py-2">Jam Standar</th>
                        <th className="px-3 py-2">Nama Siswa</th>
                        <th className="px-3 py-2">Kelas</th>
                        <th className="px-3 py-2">Durasi</th>
                        <th className="px-3 py-2">Kategori</th>
                        <th className="px-3 py-2">Catatan Bulan Ini</th>
                        <th className="px-3 py-2">Alasan</th>
                        {onDeleteRecord && <th className="px-3 py-2 text-center">Aksi</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {dailyArrivalRecords.length === 0 ? (
                        <tr>
                          <td colSpan={onDeleteRecord ? 9 : 8} className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                            Tidak ada keterlambatan kedatangan.
                          </td>
                        </tr>
                      ) : (
                        dailyArrivalRecords.map((record) => {
                          const monthlyCount =
                            dailyMonthStudentFrequencyMap.get(
                              getStudentKey(record.name, record.className)
                            ) || 0;

                          return (
                            <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                              <td className="whitespace-nowrap px-3 py-2 font-bold text-sky-600 dark:text-sky-400">{record.arrivalTime}</td>
                              <td className="whitespace-nowrap px-3 py-2">{record.schoolStartTime || '07:30'}</td>
                              <td className="px-3 py-2 font-semibold text-gray-900 dark:text-white">{record.name}</td>
                              <td className="whitespace-nowrap px-3 py-2">{record.className}</td>
                              <td className="whitespace-nowrap px-3 py-2 font-semibold text-amber-600 dark:text-amber-400">{record.durationMinutes} mnt</td>
                              <td className="whitespace-nowrap px-3 py-2">{record.category}</td>
                              <td className="whitespace-nowrap px-3 py-2">
                                {monthlyCount > 3 ? (
                                  <span className="inline-flex rounded-full bg-rose-100 px-2 py-1 text-[10px] font-bold text-rose-700 dark:bg-rose-900/50 dark:text-rose-300">
                                    🔴 Notifikasi · {monthlyCount}x
                                  </span>
                                ) : monthlyCount > 1 ? (
                                  <span className="inline-flex rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                                    ⚠️ Perhatian · {monthlyCount}x
                                  </span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-3 py-2">{record.reason || '-'}</td>
                              {onDeleteRecord && (
                                <td className="whitespace-nowrap px-3 py-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() => setDeleteConfirmRecord({ id: record.id, name: record.name })}
                                    className="font-medium text-rose-600 underline hover:text-rose-800 dark:text-rose-400"
                                  >
                                    Hapus
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-md dark:border-gray-700 dark:bg-gray-800">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white">B. Keterlambatan Penjemputan/Kepulangan</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{dailyPickupRecords.length} catatan</p>
                  </div>
                </div>

                <div className="max-h-[420px] overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
                  <table className="w-full min-w-[760px] text-left text-xs text-gray-700 dark:text-gray-300">
                    <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-3 py-2">Jam Dijemput</th>
                        <th className="px-3 py-2">Jam Standar</th>
                        <th className="px-3 py-2">Nama Siswa</th>
                        <th className="px-3 py-2">Kelas</th>
                        <th className="px-3 py-2">Durasi</th>
                        <th className="px-3 py-2">Kategori</th>
                        <th className="px-3 py-2">Catatan Bulan Ini</th>
                        <th className="px-3 py-2">Alasan</th>
                        {onDeleteRecord && <th className="px-3 py-2 text-center">Aksi</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {dailyPickupRecords.length === 0 ? (
                        <tr>
                          <td colSpan={onDeleteRecord ? 9 : 8} className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                            Tidak ada keterlambatan penjemputan/kepulangan.
                          </td>
                        </tr>
                      ) : (
                        dailyPickupRecords.map((record) => {
                          const monthlyCount =
                            dailyMonthStudentFrequencyMap.get(
                              getStudentKey(record.name, record.className)
                            ) || 0;

                          return (
                            <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                              <td className="whitespace-nowrap px-3 py-2 font-bold text-amber-600 dark:text-amber-400">{record.arrivalTime}</td>
                              <td className="whitespace-nowrap px-3 py-2">{record.schoolStartTime || '14:00'}</td>
                              <td className="px-3 py-2 font-semibold text-gray-900 dark:text-white">{record.name}</td>
                              <td className="whitespace-nowrap px-3 py-2">{record.className}</td>
                              <td className="whitespace-nowrap px-3 py-2 font-semibold text-amber-600 dark:text-amber-400">{record.durationMinutes} mnt</td>
                              <td className="whitespace-nowrap px-3 py-2">{record.category}</td>
                              <td className="whitespace-nowrap px-3 py-2">
                                {monthlyCount > 3 ? (
                                  <span className="inline-flex rounded-full bg-rose-100 px-2 py-1 text-[10px] font-bold text-rose-700 dark:bg-rose-900/50 dark:text-rose-300">
                                    🔴 Notifikasi · {monthlyCount}x
                                  </span>
                                ) : monthlyCount > 1 ? (
                                  <span className="inline-flex rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                                    ⚠️ Perhatian · {monthlyCount}x
                                  </span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-3 py-2">{record.reason || '-'}</td>
                              {onDeleteRecord && (
                                <td className="whitespace-nowrap px-3 py-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() => setDeleteConfirmRecord({ id: record.id, name: record.name })}
                                    className="font-medium text-rose-600 underline hover:text-rose-800 dark:text-rose-400"
                                  >
                                    Hapus
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Header & Filter Card */}
      <div
  className={
    reportMode === 'monthly'
      ? 'space-y-6'
      : 'hidden'
  }
>
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-100 dark:border-gray-700">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <DownloadIcon className="w-6 h-6 text-sky-600" />
              Rekap Laporan Bulanan
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Pilih bulan dan tahun untuk melihat dan mengunduh rekapitulasi keterlambatan siswa.
            </p>
          </div>

          {/* Export Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {onRefresh && (
  <button
    type="button"
    onClick={() => void onRefresh()}
    disabled={isRefreshing}
    className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
  >
    <span className={isRefreshing ? 'animate-spin' : ''}>
      ↻
    </span>

    {isRefreshing ? 'Memperbarui...' : 'Refresh Data'}
  </button>
)}
            <button
              onClick={handleExportPDF}
              disabled={filteredRecordsForMonth.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white disabled:bg-rose-300 dark:disabled:bg-rose-900/40 disabled:cursor-not-allowed transition-colors shadow-sm"
              title="Unduh Rekap PDF Bulanan"
            >
              <PdfIcon className="w-4 h-4" /> Unduh PDF
            </button>
            <button
              onClick={handleExportXLSX}
              disabled={filteredRecordsForMonth.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-emerald-300 dark:disabled:bg-emerald-900/40 disabled:cursor-not-allowed transition-colors shadow-sm"
              title="Unduh Rekap Excel Bulanan"
            >
              <ExcelIcon className="w-4 h-4" /> Unduh Excel
            </button>
            <button
              onClick={handleExportCSV}
              disabled={filteredRecordsForMonth.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-700 text-white disabled:bg-sky-300 dark:disabled:bg-sky-900/40 disabled:cursor-not-allowed transition-colors shadow-sm"
              title="Unduh Rekap CSV Bulanan"
            >
              <ExportIcon className="w-4 h-4" /> Unduh CSV
            </button>
          </div>
        </div>

        {/* Period Selector Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
          <div>
            <label htmlFor="month" className="block text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1">
              Pilih Bulan
            </label>
            <select
              id="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="block w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm text-gray-900 dark:text-white"
            >
              {monthNames.map((mName, idx) => (
                <option key={idx} value={idx}>
                  {mName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="year" className="block text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1">
              Pilih Tahun
            </label>
            <select
              id="year"
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="block w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm text-gray-900 dark:text-white"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
        </div>

      {/* Monthly Summary Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total Kejadian</p>
          <p className="text-2xl font-bold text-sky-600 dark:text-sky-400 mt-1">{monthlyStats.totalCount}x</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Kedatangan: {monthlyStats.kedatanganCount}x | Kepulangan: {monthlyStats.kepulanganCount}x</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Siswa Terlambat</p>
          <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">{monthlyStats.uniqueStudents}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Siswa berbeda bulan ini</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total Durasi Terbuang</p>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{monthlyStats.totalMinutes} mnt</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Akumulasi durasi</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Rata-rata Terlambat</p>
          <p className="text-2xl font-bold text-teal-600 dark:text-teal-400 mt-1">{monthlyStats.avgMinutes} mnt</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Per keterlambatan</p>
        </div>
      </div>

      {/* Alert siswa yang terlambat berulang */}
      {repeatedStudentAlerts.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm dark:border-amber-800 dark:bg-amber-950/30">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="font-bold text-amber-900 dark:text-amber-200">
                ⚠️ Catatan Siswa Terlambat Berulang
              </h3>
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                Siswa yang tercatat terlambat lebih dari 1 kali pada bulan {monthNames[selectedMonth]} {selectedYear}.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-[10px] font-semibold">
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                2–3 kali: Perlu perhatian
              </span>
              <span className="rounded-full bg-rose-100 px-2.5 py-1 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200">
                Lebih dari 3 kali: Notifikasi
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {repeatedStudentAlerts.map((student) => {
              const needsNotification = student.totalCount > 3;

              return (
                <div
                  key={getStudentKey(student.name, student.className)}
                  className={`rounded-lg border p-3 ${
                    needsNotification
                      ? 'border-rose-200 bg-white dark:border-rose-800 dark:bg-gray-800'
                      : 'border-amber-200 bg-white dark:border-amber-800 dark:bg-gray-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white">{student.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{student.className}</p>
                    </div>

                    <span
                      className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold ${
                        needsNotification
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
                      }`}
                    >
                      {needsNotification ? '🔴 NOTIFIKASI' : '⚠️ PERHATIAN'}
                    </span>
                  </div>

                  <p className="mt-3 text-sm font-bold text-gray-900 dark:text-white">
                    {student.totalCount} kali terlambat bulan ini
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Kedatangan: {student.arrivalCount}x · Kepulangan: {student.pickupCount}x
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* GRAFIK ANALISIS KETERLAMBATAN BULANAN */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: Daily Trend */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-5 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-500 inline-block"></span>
                Grafik Tren Keterlambatan Harian
              </h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Jumlah keterlambatan siswa per hari (Bulan {monthNames[selectedMonth]} {selectedYear})
              </p>
            </div>
          </div>

          <div className="h-64 w-full">
            {filteredRecordsForMonth.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-gray-400">
                Belum ada data keterlambatan di bulan ini
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="dateLabel" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="#9ca3af" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      borderColor: '#374151',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Bar dataKey="Kedatangan" fill="#0284c7" radius={[4, 4, 0, 0]} name="Kedatangan Pagi" />
                  <Bar dataKey="Kepulangan" fill="#d97706" radius={[4, 4, 0, 0]} name="Kepulangan Siswa" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2: Category / Reason Distribution */}
        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 space-y-3">
          <div>
            <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
              Kategori Keterlambatan
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">Proporsi durasi keterlambatan</p>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            {categoryPieData.length === 0 ? (
              <div className="text-xs text-gray-400">Belum ada data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={75}
                    innerRadius={40}
                    paddingAngle={3}
                  >
                    {categoryPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      borderColor: '#374151',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '10px' }} layout="horizontal" align="center" verticalAlign="bottom" />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Chart 3: Tardiness per Class */}
      {classChartData.length > 0 && (
        <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 space-y-3">
          <div>
            <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
              Grafik Keterlambatan Per Kelas
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Perbandingan frekuensi keterlambatan di masing-masing kelas
            </p>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={classChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="className" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    borderColor: '#374151',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
                <Bar dataKey="Kedatangan" fill="#0284c7" radius={[4, 4, 0, 0]} name="Kedatangan Pagi" />
                <Bar dataKey="Kepulangan" fill="#d97706" radius={[4, 4, 0, 0]} name="Kepulangan Siswa" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* DETAILED REKAP BULANAN TABLE */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <TagIcon className="w-5 h-5 text-sky-600" />
              Rekap Data Keterlambatan ({detailedRecords.length} Catatan)
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Rincian seluruh keterlambatan siswa selama bulan {monthNames[selectedMonth]} {selectedYear}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
              <input
                type="text"
                value={recordSearch}
                onChange={(e) => setRecordSearch(e.target.value)}
                placeholder="Cari nama atau alasan..."
                className="pl-8 pr-3 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:outline-none w-full sm:w-40"
              />
            </div>
            {/* Date Filter */}
<div className="flex items-center gap-1">
  <input
    type="date"
    value={recordDateFilter}
    onChange={(e) => setRecordDateFilter(e.target.value)}
    className="px-2.5 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
    title="Pilih tanggal catatan"
  />

  {recordDateFilter && (
    <button
      type="button"
      onClick={() => setRecordDateFilter('')}
      className="px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
    >
      Semua
    </button>
  )}
</div>

            {/* Class Filter */}
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
            >
              <option value="">Semua Kelas</option>
              {monthlyClassOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {/* Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="px-2.5 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
            >
              <option value="all">Semua Pendataan</option>
              <option value="kedatangan">🌅 Kedatangan Pagi</option>
              <option value="kepulangan">🌇 Kepulangan Siswa</option>
            </select>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
            >
              <option value="">Semua Kategori</option>
              <option value={TardinessCategory.Ringan}>Ringan (1-5 mnt)</option>
              <option value={TardinessCategory.Sedang}>Sedang (6-15 mnt)</option>
              <option value={TardinessCategory.Berat}>Berat (&gt;15 mnt)</option>
            </select>

            {/* Sort Order */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-2.5 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
            >
              <option value="date-desc">Terbaru</option>
              <option value="date-asc">Terlama</option>
              <option value="duration-desc">Durasi Terlama</option>
            </select>
          </div>
        </div>

        {/* Detailed Table */}
        <div className="mb-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
  <span className="text-base">↕</span>
  <span>Scroll ke bawah untuk melihat catatan lainnya</span>
</div>
        <div className="max-h-[520px] overflow-y-auto overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-left text-sm text-gray-700 dark:text-gray-300">
            <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="py-3 px-4">Tanggal</th>
                <th className="py-3 px-4">Jenis</th>
                <th className="py-3 px-4">Jam Datang/Jemput</th>
                <th className="py-3 px-4">Jam Standar</th>
                <th className="py-3 px-4">Nama Siswa</th>
                <th className="py-3 px-4">Kelas</th>
                <th className="py-3 px-4">Durasi Terlambat</th>
                <th className="py-3 px-4">Kategori</th>
                <th className="py-3 px-4">Catatan</th>
                <th className="py-3 px-4">Alasan</th>
                {onDeleteRecord && <th className="py-3 px-4 text-center">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {detailedRecords.length === 0 ? (
                <tr>
                  <td colSpan={onDeleteRecord ? 11 : 10} className="py-8 text-center text-gray-500 dark:text-gray-400">
                    Tidak ada catatan keterlambatan untuk periode {monthNames[selectedMonth]} {selectedYear}.
                  </td>
                </tr>
              ) : (
                detailedRecords.map((rec) => {
                  const formattedDate = new Date(rec.id).toLocaleDateString('id-ID', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  });

                  const isKepulangan = rec.tardinessType === 'kepulangan';
                  const studentFrequency = monthlyStudentFrequencyMap.get(
                    getStudentKey(rec.name, rec.className)
                  );
                  const monthlyCount = studentFrequency?.totalCount || 0;

                  return (
                    <tr key={rec.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="py-3 px-4 text-xs font-medium text-gray-900 dark:text-white whitespace-nowrap">
                        {formattedDate}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-bold ${
                            isKepulangan
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                              : 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300'
                          }`}
                        >
                          {isKepulangan ? '🌇 Kepulangan' : '🌅 Kedatangan'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-sky-600 dark:text-sky-400 whitespace-nowrap">
                        {rec.arrivalTime}
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-400 whitespace-nowrap">
                        {rec.schoolStartTime || (isKepulangan ? '14:00' : '07:30')}
                      </td>
                      <td className="py-3 px-4 font-semibold text-gray-900 dark:text-white">
                        {rec.name}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="px-2.5 py-0.5 bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 rounded text-xs font-medium">
                          {rec.className}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold whitespace-nowrap text-amber-600 dark:text-amber-400">
                        {rec.durationMinutes} menit
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                            rec.category === 'Ringan'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                              : rec.category === 'Sedang'
                              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                          }`}
                        >
                          {rec.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {monthlyCount > 3 ? (
                          <span className="inline-flex rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-bold text-rose-700 dark:bg-rose-900/50 dark:text-rose-300">
                            🔴 Notifikasi · {monthlyCount}x
                          </span>
                        ) : monthlyCount > 1 ? (
                          <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                            ⚠️ Perhatian · {monthlyCount}x
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-600 dark:text-gray-300">
                        {rec.reason || '-'}
                      </td>
                      {onDeleteRecord && (
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <button
                            onClick={() => setDeleteConfirmRecord({ id: rec.id, name: rec.name })}
                            className="text-xs text-rose-600 hover:text-rose-800 dark:text-rose-400 font-medium underline"
                          >
                            Hapus
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
      {/* Delete Confirmation Modal */}
      {deleteConfirmRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 dark:border-gray-700 space-y-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              Hapus Catatan Keterlambatan?
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Apakah Anda yakin ingin menghapus catatan keterlambatan untuk <strong className="text-gray-900 dark:text-white">{deleteConfirmRecord.name}</strong>?
            </p>
            <div className="flex justify-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setDeleteConfirmRecord(null)}
                className="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 rounded-lg"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteRecord) {
                    onDeleteRecord(deleteConfirmRecord.id);
                  }
                  setDeleteConfirmRecord(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow"
              >
                Hapus Catatan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
