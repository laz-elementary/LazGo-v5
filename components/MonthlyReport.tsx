import React, { useState, useMemo, useEffect } from 'react';
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

interface MonthlyReportProps {
  allRecords: TardinessRecord[];
  onDeleteRecord?: (id: string) => void;
  onRefresh?: () => Promise<void>;
isRefreshing?: boolean;
}

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

  const handleExportCSV = () => {
    if (filteredRecordsForMonth.length === 0) {
      alert('Tidak ada data untuk diekspor pada bulan ini.');
      return;
    }
    const headers = ['ID', 'Tanggal', 'Jenis', 'Jam Datang/Jemput', 'Jam Standar', 'Nama Siswa', 'Kelas', 'Durasi Terlambat (mnt)', 'Kategori', 'Alasan'];
    const csvContent = [
      headers.join(','),
     ...sortedRecordsForExport.map((r) =>
        [
          `"${r.id}"`,
          `"${new Date(r.id).toLocaleDateString('id-ID')}"`,
          `"${r.tardinessType === 'kepulangan' ? 'Kepulangan' : 'Kedatangan'}"`,
          `"${r.arrivalTime}"`,
          `"${r.schoolStartTime || (r.tardinessType === 'kepulangan' ? '14:00' : '07:30')}"`,
          `"${r.name}"`,
          `"${r.className}"`,
          r.durationMinutes,
          r.category,
          `"${r.reason || ''}"`,
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${reportFileName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportXLSX = () => {
    if (filteredRecordsForMonth.length === 0) {
      alert('Tidak ada data untuk diekspor pada bulan ini.');
      return;
    }
    const dataToExport = sortedRecordsForExport.map((r) => ({
      Tanggal: new Date(r.id).toLocaleDateString('id-ID'),
      Jenis: r.tardinessType === 'kepulangan' ? 'Kepulangan' : 'Kedatangan',
      'Jam Realisasi': r.arrivalTime,
      'Jam Standar': r.schoolStartTime || (r.tardinessType === 'kepulangan' ? '14:00' : '07:30'),
      'Nama Siswa': r.name,
      Kelas: r.className,
      'Durasi Terlambat (menit)': r.durationMinutes,
      Kategori: r.category,
      Alasan: r.reason || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Keterlambatan Bulanan');
    XLSX.writeFile(workbook, `${reportFileName}.xlsx`);
  };

  const handleExportPDF = () => {
    if (filteredRecordsForMonth.length === 0) {
      alert('Tidak ada data untuk diekspor pada bulan ini.');
      return;
    }

    try {
      const doc = new jsPDF();

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

      const tableColumn = [
  'Tanggal',
  'Jam Realisasi',
  'Nama Siswa',
  'Kelas',
  'Durasi (mnt)',
  'Kategori',
  'Alasan',
];

const buatBarisBulanan = (
  records: TardinessRecord[]
) =>
  records.map((record) => [
    new Date(record.id).toLocaleDateString('id-ID'),
    record.arrivalTime,
    record.name,
    record.className,
    `${record.durationMinutes} mnt`,
    record.category,
    record.reason || '-',
  ]);

const kedatanganBulanan =
  sortedRecordsForExport.filter(
    (record) =>
      record.tardinessType !== 'kepulangan'
  );

const kepulanganBulanan =
  sortedRecordsForExport.filter(
    (record) =>
      record.tardinessType === 'kepulangan'
  );

let posisiY = 38;

doc.setTextColor(0);

if (kedatanganBulanan.length > 0) {
  doc.setFontSize(11);
  doc.text(
    'A. Keterlambatan Kedatangan',
    14,
    posisiY
  );

  autoTable(doc, {
    head: [tableColumn],
    body: buatBarisBulanan(kedatanganBulanan),
    startY: posisiY + 4,
    styles: {
      fontSize: 8,
    },
    headStyles: {
      fillColor: [14, 116, 144],
    },
  });

  posisiY =
    ((doc as any).lastAutoTable?.finalY ??
      posisiY + 4) + 10;
}

if (kepulanganBulanan.length > 0) {
  if (posisiY > 260) {
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
    head: [tableColumn],
    body: buatBarisBulanan(kepulanganBulanan),
    startY: posisiY + 4,
    styles: {
      fontSize: 8,
    },
    headStyles: {
      fillColor: [14, 116, 144],
    },
  });
}

      doc.save(`${reportFileName}.pdf`);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      alert('Gagal mengunduh PDF. Silakan coba lagi.');
    }
  };

  const handleExportDailyPDF = () => {
  if (dailyRecordsForExport.length === 0) {
    alert('Tidak ada data keterlambatan pada tanggal yang dipilih.');
    return;
  }

  try {
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

const buatBarisHarian = (
  records: TardinessRecord[]
) =>
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

const kedatanganHarian =
  dailyRecordsForExport.filter(
    (record) =>
      record.tardinessType !== 'kepulangan'
  );

const kepulanganHarian =
  dailyRecordsForExport.filter(
    (record) =>
      record.tardinessType === 'kepulangan'
  );

let posisiY = 38;

doc.setTextColor(0);

if (kedatanganHarian.length > 0) {
  doc.setFontSize(11);

  doc.text(
    'A. Keterlambatan Kedatangan',
    14,
    posisiY
  );

  autoTable(doc, {
    head: [tableColumns],
    body: buatBarisHarian(kedatanganHarian),
    startY: posisiY + 4,
    styles: {
      fontSize: 8,
    },
    headStyles: {
      fillColor: [14, 116, 144],
    },
  });

  posisiY =
    ((doc as any).lastAutoTable?.finalY ??
      posisiY + 4) + 10;
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
    styles: {
      fontSize: 8,
    },
    headStyles: {
      fillColor: [14, 116, 144],
    },
  });
}
    doc.save(
      `rekap_keterlambatan_harian_${selectedDailyDate}.pdf`
    );
  } catch (error) {
    console.error('Gagal membuat PDF harian:', error);
    alert('Gagal mengunduh PDF harian. Silakan coba kembali.');
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
  <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-md dark:border-gray-700 dark:bg-gray-800">
    <div className="mb-5 flex flex-col gap-3 border-b pb-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Rekap Laporan Harian
        </h2>

        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Pilih tanggal untuk melihat dan mengunduh rekap harian.
        </p>
      </div>

      {onRefresh && (
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={isRefreshing}
          className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {isRefreshing
            ? 'Memperbarui...'
            : '↻ Refresh Data'}
        </button>
      )}
    </div>

    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
      <div>
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
          onChange={(event) =>
            setSelectedDailyDate(event.target.value)
          }
          className="block w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
      </div>

      <div className="rounded-lg bg-gray-50 px-4 py-2 dark:bg-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Total Catatan
        </p>

        <p className="text-xl font-bold text-sky-600 dark:text-sky-400">
          {dailyRecordsForExport.length}
        </p>
      </div>

      <button
        type="button"
        onClick={handleExportDailyPDF}
        disabled={dailyRecordsForExport.length === 0}
        className="flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <PdfIcon className="h-4 w-4" />
        Unduh PDF Harian
      </button>
    </div>

    {dailyRecordsForExport.length === 0 && (
      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
        Belum ada data pada tanggal yang dipilih.
      </p>
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
                <th className="py-3 px-4">Alasan</th>
                {onDeleteRecord && <th className="py-3 px-4 text-center">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {detailedRecords.length === 0 ? (
                <tr>
                  <td colSpan={onDeleteRecord ? 10 : 9} className="py-8 text-center text-gray-500 dark:text-gray-400">
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
</div>
      {/* Delete Confirmation Modal */}
  )}
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
