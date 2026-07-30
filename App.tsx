import type { Session } from '@supabase/supabase-js';
import { supabase } from './services/supabase';
import { Login } from './components/Login';
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import * as jspdf from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { StudentData, TardinessRecord, GeneratedOutput, TardinessCategory } from './types';
import { generateTardinessReport } from './services/geminiService';
import {
  ambilSemuaData,
  simpanData,
  hapusData,
  ambilDatabaseSiswa,
} from './services/database';
import {
  LogoIcon,
  SummaryIcon,
  WhatsAppIcon,
  RecapIcon,
  CopyIcon,
  CheckIcon,
  ExportIcon,
  PdfIcon,
  ExcelIcon,
  MoonIcon,
  SunIcon,
  InsightIcon,
  TagIcon,
  ClassIcon,
  PieChartIcon,
  DatabaseIcon,
  TrashIcon,
  RefreshIcon,
} from './components/icons';
import { students as defaultStudents, classNames as defaultClassNames, StudentInfo } from './data/students';
import { InputForm } from './components/InputForm';
import { MonthlyReport } from './components/MonthlyReport';
import { DatabaseManagement } from './components/DatabaseManagement';

const SCHOOL_START_TIME = '07:30';

// Helper Component for Output
const OutputDisplay: React.FC<{
  output: GeneratedOutput | null;
  isLoading: boolean;
  error: string | null;
  onRefresh?: () => void;
  lastRecord?: TardinessRecord | null;
  monthlyCount?: number;
  onUpdateText?: (newText: string) => void;
}> = ({ output, isLoading, error, onRefresh, lastRecord, monthlyCount = 0, onUpdateText }) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const isMultipleOfThree = monthlyCount > 0 && monthlyCount % 3 === 0;

  if (isLoading && !output) {
    return (
      <div className="space-y-4 animate-pulse p-4 bg-white/80 dark:bg-gray-800/80 rounded-xl">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
        <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>
    );
  }

  if (error) {
    return <div className="p-4 rounded-xl bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 text-sm">{error}</div>;
  }

  if (!output) {
    return (
      <div className="text-center py-12 px-4 bg-white/60 dark:bg-gray-800/60 rounded-xl border border-dashed border-white/20">
        <WhatsAppIcon className="mx-auto h-12 w-12 text-emerald-400 dark:text-emerald-500 opacity-80" />
        <h3 className="mt-3 text-sm font-semibold text-white">Belum Ada Pesan Pengantar</h3>
        <p className="mt-1 text-xs text-sky-200 dark:text-sky-300 max-w-sm mx-auto">
          Silakan isi formulir keterlambatan siswa di sebelah kiri. Pesan pengantar untuk orang tua akan otomatis dibuat di sini dan siap di-copas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Alert Kelipatan 3 (3x, 6x, 9x, dst) */}
      {isMultipleOfThree && lastRecord && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/80 border-l-4 border-amber-500 rounded-r-xl text-amber-900 dark:text-amber-100 text-xs font-medium space-y-1.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="font-extrabold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
              ⚠️ ALERT KEDISIPLINAN: KELIPATAN 3 KETERLAMBATAN
            </span>
            <span className="px-2.5 py-0.5 bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-extrabold rounded-full text-[10px]">
              Ke-{monthlyCount} Bulan Ini (Ke-{monthlyCount / 3} Kelipatan 3)
            </span>
          </div>
          <p className="leading-relaxed">
            Ananda <strong className="underline">{lastRecord.name}</strong> ({lastRecord.className}) telah tercatat{' '}
            <strong>{monthlyCount} kali</strong> keterlambatan di bulan ini. Pesan pengantar di bawah secara otomatis menyertakan alinea pemberitahuan khusus untuk evaluasi bersama orang tua.
          </p>
        </div>
      )}

      <div className="p-5 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-700 pb-3">
          <h3 className="font-bold text-sm flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <WhatsAppIcon className="w-5 h-5 text-emerald-500" /> Pesan Pengantar Orang Tua
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isLoading}
                title="Regenerate / Refresh isi pesan berdasarkan data terbaru"
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 active:scale-95 text-white text-xs font-semibold shadow transition-all disabled:opacity-50"
              >
                <RefreshIcon className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>{isLoading ? 'Memuat...' : 'Refresh / Buat Ulang'}</span>
              </button>
            )}
            <button
              onClick={() => handleCopy(output.whatsapp)}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-semibold shadow transition-all"
            >
              {copied ? <CheckIcon className="w-4 h-4 text-white" /> : <CopyIcon className="w-4 h-4 text-white" />}
              <span>{copied ? 'Berhasil Disalin!' : 'Salin Pesan'}</span>
            </button>
          </div>
        </div>

        {/* Editable or formatted message text container */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
              Draf Pesan WhatsApp (Dapat Diedit Langsung)
            </span>
            <button
              type="button"
              onClick={() => setIsEditing(!isEditing)}
              className="text-[11px] text-sky-600 dark:text-sky-400 font-semibold hover:underline"
            >
              {isEditing ? 'Selesai Edit' : 'Edit Pesan'}
            </button>
          </div>

          {isEditing ? (
            <textarea
              rows={10}
              value={output.whatsapp}
              onChange={(e) => onUpdateText && onUpdateText(e.target.value)}
              className="w-full p-3 bg-gray-50 dark:bg-gray-900 text-xs font-mono leading-relaxed text-gray-800 dark:text-gray-200 border border-sky-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          ) : (
            <div className="p-4 bg-gray-50 dark:bg-gray-900/80 rounded-lg text-xs font-mono leading-relaxed whitespace-pre-wrap text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 select-all">
              {output.whatsapp}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <span className="text-[11px] text-gray-500 dark:text-gray-400 italic">
            *Pesan di atas sudah diformat dengan tanda tebal (*) khas WhatsApp.
          </span>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(output.whatsapp)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold shadow transition-colors"
          >
            <WhatsAppIcon className="w-4 h-4" /> Buka WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
};

// StatCard Helper
const StatCard: React.FC<{ icon: React.ReactNode; title: string; value: string | React.ReactNode; color: string }> = ({
  icon,
  title,
  value,
  color,
}) => (
  <div className="flex items-start p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
    <div className={`mr-3 flex-shrink-0 p-2 rounded-full ${color}`}>{icon}</div>
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{title}</p>
      {typeof value === 'string' ? <p className="font-semibold text-sm break-words">{value}</p> : value}
    </div>
  </div>
);

// AI Insight Component
const AIInsight: React.FC<{ records: TardinessRecord[] }> = ({ records }) => {
  const stats = useMemo(() => {
    if (records.length === 0) {
      return null;
    }

    const reasonCounts = records.reduce((acc, rec) => {
      const reason = rec.reason || 'Tidak ada';
      acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const mostCommonReason =
      Object.keys(reasonCounts).length > 0
        ? Object.keys(reasonCounts).reduce((a, b) => (reasonCounts[a] > reasonCounts[b] ? a : b))
        : 'N/A';

    const classCounts = records.reduce((acc, rec) => {
      acc[rec.className] = (acc[rec.className] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topClass =
      Object.keys(classCounts).length > 0
        ? Object.keys(classCounts).reduce((a, b) => (classCounts[a] > classCounts[b] ? a : b))
        : 'N/A';

    const totalDuration = records.reduce((sum, rec) => sum + rec.durationMinutes, 0);
    const avgDuration = records.length > 0 ? Math.round(totalDuration / records.length) : 0;

    const categoryCounts = records.reduce(
      (acc, rec) => {
        if (acc[rec.category] !== undefined) {
          acc[rec.category]++;
        }
        return acc;
      },
      { [TardinessCategory.Ringan]: 0, [TardinessCategory.Sedang]: 0, [TardinessCategory.Berat]: 0 }
    );

    return { mostCommonReason, topClass, avgDuration, categoryCounts };
  }, [records]);

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-100 dark:border-gray-700">
      <h2 className="text-lg font-semibold mb-4 border-b pb-3 dark:border-gray-700 flex items-center gap-2 text-gray-900 dark:text-white">
        <InsightIcon className="w-5 h-5 text-sky-600" /> Analisis Pola Harian
      </h2>
      {!stats ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">Belum ada data keterlambatan hari ini.</p>
      ) : (
        <div className="space-y-3">
          <StatCard
            icon={<TagIcon className="w-4 h-4 text-purple-800 dark:text-purple-200" />}
            title="Alasan Paling Umum"
            value={stats.mostCommonReason}
            color="bg-purple-100 dark:bg-purple-900/50"
          />
          <StatCard
            icon={<ClassIcon className="w-4 h-4 text-blue-800 dark:text-blue-200" />}
            title="Kelas Teratas"
            value={stats.topClass}
            color="bg-blue-100 dark:bg-blue-900/50"
          />
          <StatCard
            icon={<LogoIcon className="w-4 h-4 text-teal-800 dark:text-teal-200" />}
            title="Rata-rata Terlambat"
            value={`${stats.avgDuration} menit`}
            color="bg-teal-100 dark:bg-teal-900/50"
          />
          <StatCard
            icon={<PieChartIcon className="w-4 h-4 text-orange-800 dark:text-orange-200" />}
            title="Distribusi Kategori"
            value={
              <div className="flex flex-wrap gap-2 text-xs font-medium mt-1">
                <span className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300 px-2 py-0.5 rounded-full">
                  Ringan: {stats.categoryCounts.Ringan}
                </span>
                <span className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300 px-2 py-0.5 rounded-full">
                  Sedang: {stats.categoryCounts.Sedang}
                </span>
                <span className="bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300 px-2 py-0.5 rounded-full">
                  Berat: {stats.categoryCounts.Berat}
                </span>
              </div>
            }
            color="bg-orange-100 dark:bg-orange-900/50"
          />
        </div>
      )}
    </div>
  );
};

export default function App() {
  // Persistence for Tardiness Records
  const [session, setSession] =
  useState<Session | null>(null);

const [authLoading, setAuthLoading] =
  useState(true);

useEffect(() => {
  async function periksaLogin() {
    const { data } =
      await supabase.auth.getSession();

    setSession(data.session);
    setAuthLoading(false);
  }

  periksaLogin();

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(
    (_event, newSession) => {
      setSession(newSession);
      setAuthLoading(false);
    }
  );

  return () => {
    subscription.unsubscribe();
  };
}, []);
  const [records, setRecords] = useState<TardinessRecord[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Persistence for Student Database
  const [studentDatabase, setStudentDatabase] =
  useState<StudentInfo[]>([]);

  // Persistence for Class Database
  const [classDatabase, setClassDatabase] =
  useState<string[]>([]);

  const [isReportLoading, setIsReportLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [lastSubmittedRecord, setLastSubmittedRecord] = useState<TardinessRecord | null>(null);
  const [lastSubmittedMonthlyCount, setLastSubmittedMonthlyCount] = useState<number>(0);

  const [output, setOutput] = useState<GeneratedOutput | null>(() => {
    try {
      const savedOutput = localStorage.getItem('dailyReportOutput');
      if (savedOutput) {
        const { date, data } = JSON.parse(savedOutput);
        const today = new Date().toDateString();
        if (date === today) {
          return data;
        }
      }
    } catch (error) {
      console.error('Could not parse daily report from localStorage', error);
    }
    return null;
  });

  const [activeTab, setActiveTab] = useState<'daily' | 'monthly' | 'database'>('daily');

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (localStorage.getItem('theme')) {
      return localStorage.getItem('theme') as 'light' | 'dark';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'dark' ? 'light' : 'dark'));
  };
  const refreshLaporanBulanan = useCallback(async () => {
  if (!session) return;

  setIsRefreshing(true);

  try {
    const dataTerbaru = await ambilSemuaData();

    setRecords(dataTerbaru);
    setError(null);
  } catch (error) {
    setError(
      error instanceof Error
        ? error.message
        : 'Gagal memperbarui laporan.'
    );
  } finally {
    setIsRefreshing(false);
  }
}, [session]);

 useEffect(() => {
  if (!session) {
    setRecords([]);
    return;
  }

  let masihAktif = true;

  async function muatDataSupabase() {
    try {
      const data = await ambilSemuaData();

      if (masihAktif) {
        setRecords(data);
        setError(null);
      }
    } catch (e: any) {
      if (masihAktif) {
        setError(
          e.message ||
            'Gagal mengambil data dari Supabase.'
        );
      }
    }
  }

  muatDataSupabase();

  const interval = window.setInterval(
    muatDataSupabase,
    10000
  );

  return () => {
    masihAktif = false;
    window.clearInterval(interval);
  };
}, [session]);

useEffect(() => {
  if (!session) {
    setStudentDatabase([]);
    setClassDatabase([]);
    return;
  }

  let masihAktif = true;

  async function muatDatabaseSiswa() {
    try {
      const hasil = await ambilDatabaseSiswa();

      if (masihAktif) {
        setStudentDatabase(hasil.students);
        setClassDatabase(hasil.classNames);
      }
    } catch (error) {
      if (masihAktif) {
        setError(
          error instanceof Error
            ? error.message
            : 'Gagal mengambil database siswa.'
        );
      }
    }
  }

  muatDatabaseSiswa();

  const intervalSiswa = window.setInterval(
    muatDatabaseSiswa,
    15000
  );

  return () => {
    masihAktif = false;
    window.clearInterval(intervalSiswa);
  };
}, [session]);

  useEffect(() => {
    if (output) {
      const today = new Date().toDateString();
      const dataToSave = { date: today, data: output };
      localStorage.setItem('dailyReportOutput', JSON.stringify(dataToSave));
    }
  }, [output]);

  const dailyRecords = useMemo(() => {
    const today = new Date().toDateString();
    return records.filter((rec) => new Date(rec.id).toDateString() === today);
  }, [records]);

  const handleFormSubmit = useCallback(
    async (data: StudentData, saveToDatabase?: boolean) => {
      // 1. Check if student or class needs to be registered in Database
      if (saveToDatabase) {
        const studentExists = studentDatabase.some(
          (s) => s.name.toLowerCase() === data.name.toLowerCase() && s.className.toLowerCase() === data.className.toLowerCase()
        );
        if (!studentExists) {
          setStudentDatabase((prev) => [...prev, { name: data.name, className: data.className }]);
        }
        if (!classDatabase.includes(data.className)) {
          setClassDatabase((prev) => [...prev, data.className].sort());
        }
      }

      // 2. Process tardiness calculation
      const isKepulangan = data.tardinessType === 'kepulangan';
      const standardTime = data.targetTime || (isKepulangan ? '14:15' : '07:30');

      const arrival = new Date(`1970-01-01T${data.arrivalTime}:00`);
      const start = new Date(`1970-01-01T${standardTime}:00`);

      let durationMinutes = Math.round((arrival.getTime() - start.getTime()) / 60000);
      if (durationMinutes < 0) durationMinutes = 0;

      let category: TardinessCategory;
      if (durationMinutes >= 1 && durationMinutes <= 5) {
        category = TardinessCategory.Ringan;
      } else if (durationMinutes >= 6 && durationMinutes <= 15) {
        category = TardinessCategory.Sedang;
      } else {
        category = TardinessCategory.Berat;
      }

      const newRecord: TardinessRecord = {
        ...data,
        id: new Date().toISOString(),
        schoolStartTime: standardTime,
        durationMinutes,
        category,
        tardinessType: data.tardinessType || 'kedatangan',
      };

      // Calculate monthly count for this student
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const existingMonthlyCount = records.filter((r) => {
        const d = new Date(r.id);
        return (
          r.name.trim().toLowerCase() === data.name.trim().toLowerCase() &&
          d.getMonth() === currentMonth &&
          d.getFullYear() === currentYear
        );
      }).length;

      const monthlyCountForThisStudent = existingMonthlyCount + 1;
      const historyForAI = dailyRecords;

setIsReportLoading(true);
setError(null);

try {
  // Simpan data ke Supabase
  const recordTersimpan = await simpanData(newRecord);

  // Tampilkan data yang sudah berhasil tersimpan
  setRecords((prev) => [
    ...prev,
    recordTersimpan,
  ]);

  setLastSubmittedRecord(recordTersimpan);

  setLastSubmittedMonthlyCount(
    monthlyCountForThisStudent
  );

  // Membuat pesan menggunakan Gemini
  const generatedOutput =
    await generateTardinessReport(
      recordTersimpan,
      historyForAI,
      monthlyCountForThisStudent
    );

  setOutput(generatedOutput);
} catch (e: any) {
  setError(
    e.message ||
      'Data gagal disimpan ke database.'
  );
} finally {
  setIsReportLoading(false);
}
    },
    [dailyRecords, studentDatabase, classDatabase, records]
  );

  const handleRefreshMessage = useCallback(async () => {
    if (!lastSubmittedRecord) return;
    setIsReportLoading(true);
    setError(null);
    try {
      const generatedOutput = await generateTardinessReport(
        lastSubmittedRecord,
        dailyRecords,
        lastSubmittedMonthlyCount
      );
      setOutput(generatedOutput);
    } catch (e: any) {
      setError(e.message || 'Gagal memperbarui pesan pengantar.');
    } finally {
      setIsReportLoading(false);
    }
  }, [lastSubmittedRecord, dailyRecords, lastSubmittedMonthlyCount]);

 const handleDeleteRecord = useCallback(
  async (id: string) => {
    const recordYangDihapus = records.find(
      (record) => record.id === id
    );

    if (!recordYangDihapus?.databaseId) {
      setError(
        'ID database tidak ditemukan. Data belum dapat dihapus.'
      );
      return;
    }

    try {
      await hapusData(recordYangDihapus.databaseId);

      setRecords((prev) =>
        prev.filter((record) => record.id !== id)
      );

      setError(null);
    } catch (e: any) {
      setError(
        e.message ||
          'Data gagal dihapus dari Supabase.'
      );
    }
  },
  [records]
);

  const dailyReportFileName = `laporan_keterlambatan_harian_${new Date()
    .toLocaleDateString('id-ID', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\//g, '-')}`;

  const handleDailyExportCSV = () => {
    if (dailyRecords.length === 0) {
      alert('Tidak ada data untuk diekspor.');
      return;
    }
    const headers = ['ID', 'Tanggal', 'Nama', 'Kelas', 'Jam Datang', 'Durasi Terlambat (mnt)', 'Kategori', 'Alasan'];
    const csvContent = [
      headers.join(','),
      ...dailyRecords.map((r) =>
        [
          `"${r.id}"`,
          `"${new Date(r.id).toLocaleDateString('id-ID')}"`,
          `"${r.name}"`,
          `"${r.className}"`,
          `"${r.arrivalTime}"`,
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
    link.setAttribute('download', `${dailyReportFileName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDailyExportXLSX = () => {
    if (dailyRecords.length === 0) {
      alert('Tidak ada data untuk diekspor.');
      return;
    }
    const dataToExport = dailyRecords.map((r) => ({
      Tanggal: new Date(r.id).toLocaleDateString('id-ID'),
      'Nama Siswa': r.name,
      Kelas: r.className,
      'Jam Datang': r.arrivalTime,
      'Durasi Terlambat (menit)': r.durationMinutes,
      Kategori: r.category,
      Alasan: r.reason || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Keterlambatan Harian');
    XLSX.writeFile(workbook, `${dailyReportFileName}.xlsx`);
  };

  const handleDailyExportPDF = () => {
    if (dailyRecords.length === 0) {
      alert('Tidak ada data untuk diekspor.');
      return;
    }

    const doc = new jspdf.jsPDF();
    const plainRecap = output?.dailyRecap ? output.dailyRecap.replace(/\*\*/g, '') : 'Rekap Harian Keterlambatan';

    doc.setFontSize(18);
    doc.text(`Laporan Keterlambatan Harian`, 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(
      `Tanggal: ${new Date().toLocaleDateString('id-ID', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })}`,
      14,
      30
    );

    doc.setFontSize(12);
    doc.text('Rekap Harian (AI)', 14, 45);
    doc.setFontSize(10);
    const splitText = doc.splitTextToSize(plainRecap, 180);
    doc.text(splitText, 14, 52);

    const tableColumn = ['Nama Siswa', 'Kelas', 'Jam Datang', 'Durasi (mnt)', 'Kategori'];
    const tableRows = dailyRecords.map((r) => [r.name, r.className, r.arrivalTime, r.durationMinutes, r.category]);

    (doc as any).autoTable({
      head: [tableColumn],
      body: tableRows,
      startY: 75,
    });

    doc.save(`${dailyReportFileName}.pdf`);
  };
if (authLoading) {
  return (
    <div className="min-h-screen flex items-center justify-center text-white">
      Memeriksa akun...
    </div>
  );
}

if (!session) {
  return <Login />;
}
  const TabButton: React.FC<{
    label: string;
    icon?: React.ReactNode;
    isActive: boolean;
    onClick: () => void;
  }> = ({ label, icon, isActive, onClick }) => (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-lg transition-all flex items-center gap-2 ${
        isActive
          ? 'bg-white text-sky-700 shadow-md dark:bg-gray-100 dark:text-sky-800 font-bold'
          : 'text-white/90 hover:bg-white/20'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto relative">
        <button
          onClick={toggleTheme}
          className="absolute top-0 right-0 p-2.5 rounded-full text-white/80 hover:bg-white/20 transition-colors"
          aria-label="Toggle dark mode"
        >
          {theme === 'light' ? <MoonIcon className="w-6 h-6" /> : <SunIcon className="w-6 h-6" />}
        </button>

        <header className="text-center mb-8">
          <div className="flex items-center justify-center gap-3">
            <LogoIcon className="w-10 h-10 text-white" />
            <h1 className="text-4xl font-extrabold tracking-tight text-white">LazGo</h1>
          </div>
          <p className="mt-2 text-sm sm:text-base font-medium text-sky-200 dark:text-sky-300">
            Where Time Meets Responsibility
          </p>
        </header>

        {/* Navigation Tabs */}
        <div className="flex justify-center mb-8">
          <div className="flex space-x-2 p-1.5 bg-blue-900/40 dark:bg-white/10 rounded-xl backdrop-blur-md shadow-inner border border-white/10">
            <TabButton
              label="Input Harian"
              isActive={activeTab === 'daily'}
              onClick={() => setActiveTab('daily')}
            />
            <TabButton
              label="Laporan Bulanan"
              isActive={activeTab === 'monthly'}
              onClick={() => setActiveTab('monthly')}
            />
            <TabButton
              label="Database Siswa & Kelas"
              icon={<DatabaseIcon className="w-4 h-4" />}
              isActive={activeTab === 'database'}
              onClick={() => setActiveTab('database')}
            />
          </div>
        </div>

        <main>
          {activeTab === 'daily' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-100 dark:border-gray-700">
                  <h2 className="text-lg font-bold mb-4 border-b pb-3 dark:border-gray-700 text-gray-900 dark:text-white">
                    Input Data Keterlambatan
                  </h2>
                  <InputForm
                    onSubmit={handleFormSubmit}
                    studentsList={studentDatabase}
                    classList={classDatabase}
                    allRecords={records}
                  />
                </div>

                <AIInsight records={dailyRecords} />

                {dailyRecords.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-100 dark:border-gray-700">
                    <h2 className="text-lg font-bold mb-4 border-b pb-3 dark:border-gray-700 text-gray-900 dark:text-white flex justify-between items-center">
                      <span>Riwayat Hari Ini ({dailyRecords.length})</span>
                    </h2>
                    <ul className="space-y-3 max-h-60 overflow-y-auto pr-2">
                      {dailyRecords
                        .slice()
                        .reverse()
                        .map((rec) => (
                          <li
                            key={rec.id}
                            className="text-xs p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg flex justify-between items-center border border-gray-200 dark:border-gray-600"
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-gray-900 dark:text-white">{rec.name}</span>
                                <span className="text-gray-500 dark:text-gray-400">({rec.className})</span>
                                <span
                                  className={`px-1.5 py-0.2 text-[10px] font-semibold rounded ${
                                    rec.tardinessType === 'kepulangan'
                                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                                      : 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300'
                                  }`}
                                >
                                  {rec.tardinessType === 'kepulangan' ? '🌇 Kepulangan' : '🌅 Kedatangan'}
                                </span>
                              </div>
                              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                {rec.tardinessType === 'kepulangan' ? 'Jam Pulang/Jemput' : 'Jam Datang'}:{' '}
                                <strong className="text-sky-600 dark:text-sky-400">{rec.arrivalTime}</strong> (Std: {rec.schoolStartTime || '07:30'}) | Alasan: {rec.reason || '-'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                  rec.category === 'Ringan'
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                                    : rec.category === 'Sedang'
                                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
                                    : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                                }`}
                              >
                                {rec.durationMinutes} mnt
                              </span>
                              <button
                                onClick={() => handleDeleteRecord(rec.id)}
                                title="Hapus catatan ini"
                                className="text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 p-1 transition-colors"
                              >
                                <TrashIcon className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="bg-blue-800/30 dark:bg-white/5 backdrop-blur-md p-6 rounded-xl shadow-lg border border-white/10">
                <div className="flex flex-wrap justify-between items-center gap-4 border-b border-white/30 pb-3 mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <WhatsAppIcon className="w-6 h-6 text-emerald-400" /> Pesan Pengantar Orang Tua
                    </h2>
                    <p className="text-xs text-sky-200 dark:text-sky-300 mt-0.5">
                      {new Date().toLocaleDateString('id-ID', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDailyExportPDF}
                      title="Unduh PDF"
                      disabled={dailyRecords.length === 0 || !output}
                      className="flex items-center gap-2 py-1 px-3 text-xs font-semibold rounded-md bg-white/20 hover:bg-white/30 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <PdfIcon className="w-4 h-4" /> <span>PDF</span>
                    </button>
                    <button
                      onClick={handleDailyExportXLSX}
                      title="Unduh Excel"
                      disabled={dailyRecords.length === 0}
                      className="flex items-center gap-2 py-1 px-3 text-xs font-semibold rounded-md bg-white/20 hover:bg-white/30 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ExcelIcon className="w-4 h-4" /> <span>Excel</span>
                    </button>
                    <button
                      onClick={handleDailyExportCSV}
                      title="Unduh CSV"
                      disabled={dailyRecords.length === 0}
                      className="flex items-center gap-2 py-1 px-3 text-xs font-semibold rounded-md bg-white/20 hover:bg-white/30 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ExportIcon className="w-4 h-4" /> <span>CSV</span>
                    </button>
                  </div>
                </div>
                <OutputDisplay
                  output={output}
                  isLoading={isReportLoading}
                  error={error}
                  onRefresh={handleRefreshMessage}
                  lastRecord={lastSubmittedRecord}
                  monthlyCount={lastSubmittedMonthlyCount}
                  onUpdateText={(newText) =>
                    setOutput((prev) => (prev ? { ...prev, whatsapp: newText } : null))
                  }
                />
              </div>
            </div>
          )}

          {activeTab === 'monthly' && (
            <MonthlyReport allRecords={records} onDeleteRecord={handleDeleteRecord} 
              onRefresh={refreshLaporanBulanan}
isRefreshing={isRefreshing}/>
          )}

          {activeTab === 'database' && (
            <DatabaseManagement
              students={studentDatabase}
              classNames={classDatabase}
              onUpdateStudents={setStudentDatabase}
              onUpdateClasses={setClassDatabase}
            />
          )}
        </main>
      </div>
    </div>
  );
}
