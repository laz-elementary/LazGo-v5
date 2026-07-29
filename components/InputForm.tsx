import React, { useState, useMemo } from 'react';
import { StudentData, TardinessRecord, TardinessType } from '../types';
import { StudentInfo } from '../data/students';

const DEFAULT_START_TIME = '07:30';
const DEFAULT_DISMISSAL_TIME = '14:15';

interface InputFormProps {
  onSubmit: (data: StudentData, saveToDatabase?: boolean) => void;
  studentsList: StudentInfo[];
  classList: string[];
  allRecords?: TardinessRecord[];
}

export const InputForm: React.FC<InputFormProps> = ({ onSubmit, studentsList, classList, allRecords = [] }) => {
  const getCurrentTime = () => {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const [tardinessType, setTardinessType] = useState<TardinessType>('kedatangan');
  const [targetTime, setTargetTime] = useState(DEFAULT_START_TIME);
  const [name, setName] = useState('');
  const [className, setClassName] = useState('');
  const [arrivalTime, setArrivalTime] = useState(getCurrentTime);
  const [selectedReason, setSelectedReason] = useState('Lain-lain (Tulis Sendiri)');
  const [customReason, setCustomReason] = useState('');

  const [nameSuggestions, setNameSuggestions] = useState<StudentInfo[]>([]);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);

  const [classSuggestions, setClassSuggestions] = useState<string[]>([]);
  const [showClassSuggestions, setShowClassSuggestions] = useState(false);

  const [autoSaveNewStudent, setAutoSaveNewStudent] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const handleTardinessTypeChange = (type: TardinessType) => {
    setTardinessType(type);
    if (type === 'kedatangan') {
      setTargetTime(DEFAULT_START_TIME);
    } else {
      setTargetTime(DEFAULT_DISMISSAL_TIME);
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setName(value);
    if (value.length > 0) {
      const filtered = studentsList
        .filter((s) => s.name.toLowerCase().includes(value.toLowerCase()))
        .slice(0, 6);
      setNameSuggestions(filtered);
      setShowNameSuggestions(true);
    } else {
      setShowNameSuggestions(false);
    }
  };

  const handleNameSuggestionClick = (student: StudentInfo) => {
    setName(student.name);
    setClassName(student.className);
    setShowNameSuggestions(false);
  };

  const handleClassNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setClassName(value);
    if (value.length > 0) {
      const filtered = classList
        .filter((c) => c.toLowerCase().includes(value.toLowerCase()))
        .slice(0, 6);
      setClassSuggestions(filtered);
      setShowClassSuggestions(true);
    } else {
      setShowClassSuggestions(false);
    }
  };

  const handleClassSuggestionClick = (cName: string) => {
    setClassName(cName);
    setShowClassSuggestions(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim() || !className.trim() || !arrivalTime) {
      setFormError('Nama, Kelas, dan Jam Wajib diisi.');
      return;
    }
    const finalReason = selectedReason === 'Lain-lain (Tulis Sendiri)' ? customReason.trim() : (selectedReason === 'Lainnya...' ? customReason.trim() : selectedReason);

    onSubmit(
      {
        name: name.trim(),
        className: className.trim(),
        arrivalTime,
        tardinessType,
        targetTime,
        reason: finalReason || 'Tidak ada catatan khusus',
      },
      autoSaveNewStudent
    );

    setName('');
    setClassName('');
    setArrivalTime(getCurrentTime());
    setSelectedReason('Lain-lain (Tulis Sendiri)');
    setCustomReason('');
  };

  const existingCountThisMonth = useMemo(() => {
    if (!name.trim()) return 0;
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    return allRecords.filter((r) => {
      const d = new Date(r.id);
      return (
        r.name.trim().toLowerCase() === name.trim().toLowerCase() &&
        d.getMonth() === currentMonth &&
        d.getFullYear() === currentYear
      );
    }).length;
  }, [name, allRecords]);

  const isStudentInDatabase = studentsList.some(
    (s) => s.name.toLowerCase() === name.trim().toLowerCase() && s.className.toLowerCase() === className.trim().toLowerCase()
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Tipe Keterlambatan Switcher */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
          Kategori Pendataan
        </label>
        <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 dark:bg-gray-700/60 rounded-xl border border-gray-200 dark:border-gray-600">
          <button
            type="button"
            onClick={() => handleTardinessTypeChange('kedatangan')}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
              tardinessType === 'kedatangan'
                ? 'bg-sky-600 text-white shadow'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            <span>🌅 Kedatangan Pagi</span>
          </button>
          <button
            type="button"
            onClick={() => handleTardinessTypeChange('kepulangan')}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
              tardinessType === 'kepulangan'
                ? 'bg-amber-600 text-white shadow'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            <span>🌇 Kepulangan Siswa</span>
          </button>
        </div>
      </div>

      {formError && (
        <div className="p-3 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-lg text-xs font-medium">
          {formError}
        </div>
      )}

      {/* Nama Siswa Input */}
      <div className="relative">
        <label htmlFor="name" className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">
          Nama Siswa
        </label>
        <input
          type="text"
          id="name"
          value={name}
          onChange={handleNameChange}
          onBlur={() => setTimeout(() => setShowNameSuggestions(false), 200)}
          onFocus={handleNameChange}
          required
          autoComplete="off"
          placeholder="Ketik nama siswa..."
          className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500 sm:text-sm text-gray-900 dark:text-white"
        />
        {showNameSuggestions && nameSuggestions.length > 0 && (
          <ul className="absolute z-30 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md mt-1 shadow-xl max-h-60 overflow-auto divide-y divide-gray-100 dark:divide-gray-600">
            {nameSuggestions.map((s, index) => (
              <li
                key={index}
                onMouseDown={() => handleNameSuggestionClick(s)}
                className="px-3 py-2 hover:bg-sky-50 dark:hover:bg-gray-600 cursor-pointer text-sm text-gray-900 dark:text-white flex justify-between items-center"
              >
                <span>{s.name}</span>
                <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded">
                  {s.className}
                </span>
              </li>
            ))}
          </ul>
        )}
        {existingCountThisMonth > 0 && (
          <div
            className={`mt-1.5 p-2 rounded-md text-xs font-semibold flex items-center justify-between border ${
              (existingCountThisMonth + 1) % 3 === 0
                ? 'bg-amber-50 dark:bg-amber-950/70 border-amber-400 text-amber-800 dark:text-amber-300'
                : existingCountThisMonth % 3 === 0
                ? 'bg-red-50 dark:bg-red-950/70 border-red-400 text-red-800 dark:text-red-300'
                : 'bg-sky-50 dark:bg-sky-950/70 border-sky-300 text-sky-800 dark:text-sky-300'
            }`}
          >
            <span>
              {(existingCountThisMonth + 1) % 3 === 0
                ? `⚠️ Siswa ini sudah ${existingCountThisMonth}x terlambat bulan ini. Input ini akan mencapai Kelipatan 3 (Ke-${existingCountThisMonth + 1})!`
                : existingCountThisMonth % 3 === 0
                ? `🚨 Siswa ini sudah ${existingCountThisMonth}x terlambat di bulan ini (Kelipatan 3).`
                : `ℹ️ Riwayat keterlambatan bulan ini: ${existingCountThisMonth}x.`}
            </span>
          </div>
        )}
      </div>

      {/* Kelas Input */}
      <div className="relative">
        <label htmlFor="className" className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">
          Kelas
        </label>
        <input
          type="text"
          id="className"
          value={className}
          onChange={handleClassNameChange}
          onBlur={() => setTimeout(() => setShowClassSuggestions(false), 200)}
          onFocus={handleClassNameChange}
          required
          autoComplete="off"
          placeholder="Ketik atau pilih kelas..."
          className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500 sm:text-sm text-gray-900 dark:text-white"
        />
        {showClassSuggestions && classSuggestions.length > 0 && (
          <ul className="absolute z-20 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md mt-1 shadow-xl max-h-60 overflow-auto">
            {classSuggestions.map((c, index) => (
              <li
                key={index}
                onMouseDown={() => handleClassSuggestionClick(c)}
                className="px-3 py-2 hover:bg-sky-50 dark:hover:bg-gray-600 cursor-pointer text-sm text-gray-900 dark:text-white"
              >
                {c}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Jam Masuk/Pulang Standard & Jam Datang/Dijemput Actual */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
            {tardinessType === 'kedatangan' ? 'Jam Masuk (Standar)' : 'Jam Kepulangan (Standar)'}
          </label>
          {tardinessType === 'kepulangan' ? (
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setTargetTime('13:30')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition-colors ${
                    targetTime === '13:30'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-amber-50 dark:hover:bg-gray-600'
                  }`}
                >
                  13:30 WIB
                </button>
                <button
                  type="button"
                  onClick={() => setTargetTime('14:15')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition-colors ${
                    targetTime === '14:15'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-amber-50 dark:hover:bg-gray-600'
                  }`}
                >
                  14:15 WIB
                </button>
              </div>
              <input
                type="time"
                value={targetTime}
                onChange={(e) => setTargetTime(e.target.value)}
                className="block w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-700/60 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm sm:text-xs text-gray-800 dark:text-gray-200 font-semibold focus:ring-2 focus:ring-amber-500"
              />
            </div>
          ) : (
            <input
              type="time"
              value={targetTime}
              onChange={(e) => setTargetTime(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-gray-100 dark:bg-gray-700/60 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm sm:text-sm text-gray-800 dark:text-gray-200 font-semibold focus:ring-2 focus:ring-sky-500"
            />
          )}
        </div>
        <div>
          <label htmlFor="arrivalTime" className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
            {tardinessType === 'kedatangan' ? 'Jam Datang Siswa' : 'Jam Penjemputan / Pulang'}
          </label>
          <input
            type="time"
            id="arrivalTime"
            value={arrivalTime}
            onChange={(e) => setArrivalTime(e.target.value)}
            required
            className="block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 sm:text-sm text-gray-900 dark:text-white font-bold"
          />
        </div>
      </div>

      {/* Alasan */}
      <div>
        <label htmlFor="reason" className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">
          Alasan Keterlambatan
        </label>
        <select
          id="reason"
          value={selectedReason}
          onChange={(e) => setSelectedReason(e.target.value)}
          className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 sm:text-sm text-gray-900 dark:text-white font-medium"
        >
          <option value="Lain-lain (Tulis Sendiri)">Lain-lain (Tulis Sendiri oleh Guru Piket)</option>
          {tardinessType === 'kedatangan' ? (
            <>
              <option value="Macet">Macet di Jalan</option>
              <option value="Telat Bangun">Telat Bangun Pagi</option>
              <option value="Hujan / Cuaca">Hujan / Kendala Cuaca</option>
              <option value="Tidur Larut Malam">Tidur Larut Malam</option>
              <option value="Kendala Kendaraan">Kendala Kendaraan</option>
            </>
          ) : (
            <>
              <option value="Macet Penjemputan">Macet Saat Penjemputan</option>
              <option value="Orang Tua Terlambat Jemput">Orang Tua Terlambat Jemput</option>
              <option value="Ada Kunjungan / Urusan Luar">Kesibukan / Urusan Orang Tua</option>
              <option value="Kendala Cuaca / Hujan">Terkendala Hujan / Cuaca</option>
              <option value="Salah Jam Penjemputan">Salah Komunikasi Jam Pulang</option>
            </>
          )}
        </select>
      </div>

      {/* Textarea for custom written reason */}
      {(selectedReason === 'Lain-lain (Tulis Sendiri)' || selectedReason === 'Lainnya...') && (
        <div className="animate-fade-in">
          <label htmlFor="customReason" className="block text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
            Tulis Alasan / Catatan Guru Piket
          </label>
          <textarea
            id="customReason"
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            rows={2}
            required
            className="mt-1 block w-full px-3 py-2 bg-sky-50/50 dark:bg-gray-700/80 border border-sky-300 dark:border-sky-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500 sm:text-sm text-gray-900 dark:text-white"
            placeholder="Tuliskan catatan/alasan dari guru piket di sini..."
          />
        </div>
      )}

      {/* Auto register new student checkbox if name/class not found in database */}
      {name.trim() && className.trim() && !isStudentInDatabase && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-md">
          <label className="flex items-center gap-2 text-xs font-medium text-amber-800 dark:text-amber-200 cursor-pointer">
            <input
              type="checkbox"
              checked={autoSaveNewStudent}
              onChange={(e) => setAutoSaveNewStudent(e.target.checked)}
              className="text-sky-600 rounded"
            />
            <span>Siswa ini belum ada di Database. Otomatis simpan ke Database Siswa & Kelas.</span>
          </label>
        </div>
      )}

      <button
        type="submit"
        className={`w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-semibold text-white transition-colors ${
          tardinessType === 'kedatangan'
            ? 'bg-sky-600 hover:bg-sky-700 focus:ring-sky-500'
            : 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500'
        }`}
      >
        Proses & Buat Pesan WhatsApp ({tardinessType === 'kedatangan' ? 'Kedatangan' : 'Kepulangan'})
      </button>
    </form>
  );
};
