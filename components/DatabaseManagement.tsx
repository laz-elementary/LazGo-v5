import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { StudentInfo } from '../data/students';
import { DatabaseIcon, UploadIcon, PlusIcon, TrashIcon, EditIcon, DownloadIcon, UsersIcon, SearchIcon, ClassIcon, CheckIcon } from './icons';
import {
  simpanDatabaseSiswa,
  tambahSiswaManual,
  ubahSiswaManual,
} from '../services/database';

interface DatabaseManagementProps {
  students: StudentInfo[];
  classNames: string[];
  onUpdateStudents: (updatedStudents: StudentInfo[]) => void;
  onUpdateClasses: (updatedClasses: string[]) => void;
}

export const DatabaseManagement: React.FC<DatabaseManagementProps> = ({
  students,
  classNames,
  onUpdateStudents,
  onUpdateClasses,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'students' | 'classes' | 'import'>('students');

  // Search & Filters
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('');

  // Add / Edit Student Form State
  const [studentNameInput, setStudentNameInput] = useState('');
  const [studentClassInput, setStudentClassInput] = useState('');
  const [editingStudentIndex, setEditingStudentIndex] = useState<number | null>(null);

  // Add / Edit Class Form State
  const [newClassNameInput, setNewClassNameInput] = useState('');
  const [editingClassOldName, setEditingClassOldName] = useState<string | null>(null);

  // Excel / CSV / Text Import State
  const [importType, setImportType] = useState<'file' | 'paste'>('file');
  const [pastedText, setPastedText] = useState('');
  const [previewData, setPreviewData] = useState<StudentInfo[]>([]);
  const [importFileName, setImportFileName] = useState<string>('');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');

  // Notification Toast State
  const [notification, setNotification] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Custom Confirmation Modal State (Replaces window.confirm)
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    type?: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(null), 4000);
  };

  // Filtered Students List
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const matchesSearch = s.name.toLowerCase().includes(studentSearch.toLowerCase());
      const matchesClass = selectedClassFilter ? s.className === selectedClassFilter : true;
      return matchesSearch && matchesClass;
    });
  }, [students, studentSearch, selectedClassFilter]);

  // Class Counts Mapping
  const classStudentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    classNames.forEach((c) => {
      counts[c] = 0;
    });
    students.forEach((s) => {
      counts[s.className] = (counts[s.className] || 0) + 1;
    });
    return counts;
  }, [students, classNames]);

  // Handle Add or Edit Student
  
    const handleSaveStudent = async (
  e: React.FormEvent
) => {
  e.preventDefault();

  if (
    !studentNameInput.trim() ||
    !studentClassInput.trim()
  ) {
    showError('Nama Siswa dan Kelas harus diisi.');
    return;
  }

  const trimmedName = studentNameInput.trim();
  const trimmedClass = studentClassInput.trim();

  const studentBaru: StudentInfo = {
    name: trimmedName,
    className: trimmedClass,
  };

  const updatedClasses = classNames.includes(trimmedClass)
    ? classNames
    : [...classNames, trimmedClass].sort();

  try {
    if (editingStudentIndex !== null) {
      const studentLama =
        students[editingStudentIndex];

      await ubahSiswaManual(
        studentLama,
        studentBaru
      );

      const updatedStudents = [...students];

      updatedStudents[editingStudentIndex] =
        studentBaru;

      onUpdateStudents(updatedStudents);
      onUpdateClasses(updatedClasses);

      showNotification(
        `Siswa "${trimmedName}" berhasil diperbarui.`
      );

      setEditingStudentIndex(null);
    } else {
      const duplicate = students.some(
        (student) =>
          student.name.toLowerCase() ===
            trimmedName.toLowerCase() &&
          student.className.toLowerCase() ===
            trimmedClass.toLowerCase()
      );

      if (duplicate) {
        showError(
          'Siswa dengan nama dan kelas yang sama sudah ada.'
        );
        return;
      }

      await tambahSiswaManual(studentBaru);

      onUpdateStudents([
        ...students,
        studentBaru,
      ]);

      onUpdateClasses(updatedClasses);

      showNotification(
        `Siswa "${trimmedName}" berhasil ditambahkan.`
      );
    }

    setStudentNameInput('');
    setStudentClassInput('');
  } catch (error) {
    showError(
      error instanceof Error
        ? error.message
        : 'Gagal menyimpan siswa ke database.'
    );
  }
};

    if (editingStudentIndex !== null) {
      // Edit existing
      const updated = [...students];
      updated[editingStudentIndex] = { name: trimmedName, className: trimmedClass };
      onUpdateStudents(updated);
      showNotification(`Siswa "${trimmedName}" berhasil diperbarui.`);
      setEditingStudentIndex(null);
    } else {
      // Add new student
      const duplicate = students.some(
        (s) => s.name.toLowerCase() === trimmedName.toLowerCase() && s.className === trimmedClass
      );
      if (duplicate) {
        showError('Siswa dengan nama dan kelas yang sama sudah ada.');
        return;
      }
      onUpdateStudents([...students, { name: trimmedName, className: trimmedClass }]);
      showNotification(`Siswa "${trimmedName}" berhasil ditambahkan.`);
    }

    setStudentNameInput('');
    setStudentClassInput('');
  };

  const handleStartEditStudent = (index: number) => {
    const target = students[index];
    setStudentNameInput(target.name);
    setStudentClassInput(target.className);
    setEditingStudentIndex(index);
  };

  const handleDeleteStudent = (index: number) => {
    const target = students[index];
    setModalConfig({
      isOpen: true,
      title: 'Hapus Data Siswa',
      message: `Apakah Anda yakin ingin menghapus siswa "${target.name}" (${target.className})?`,
      confirmText: 'Ya, Hapus',
      type: 'danger',
      onConfirm: () => {
        const updated = students.filter((_, i) => i !== index);
        onUpdateStudents(updated);
        showNotification(`Siswa "${target.name}" telah dihapus.`);
        setModalConfig((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  // Handle Clear All Students (Reset for new school year)
  const handleClearAllStudents = () => {
    if (students.length === 0) {
      showError('Daftar siswa sudah kosong.');
      return;
    }
    setModalConfig({
      isOpen: true,
      title: 'Kosongkan Seluruh Database Siswa?',
      message: `PERINGATAN: Apakah Anda yakin ingin MENGHAPUS SEMUA (${students.length}) data siswa?\n\nTindakan ini akan mengosongkan daftar siswa untuk pergantian tahun ajaran baru.`,
      confirmText: 'Ya, Kosongkan Semua Siswa',
      type: 'danger',
      onConfirm: () => {
        onUpdateStudents([]);
        showNotification('Semua data siswa terdaftar berhasil dikosongkan!');
        setModalConfig((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  // Handle Add or Edit Class
  const handleSaveClass = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newClassNameInput.trim();
    if (!trimmed) return;

    if (editingClassOldName) {
      if (classNames.includes(trimmed) && trimmed !== editingClassOldName) {
        showError('Nama kelas tersebut sudah ada.');
        return;
      }
      const updatedClasses = classNames.map((c) => (c === editingClassOldName ? trimmed : c)).sort();
      const updatedStudents = students.map((s) =>
        s.className === editingClassOldName ? { ...s, className: trimmed } : s
      );
      onUpdateClasses(updatedClasses);
      onUpdateStudents(updatedStudents);
      showNotification(`Kelas "${editingClassOldName}" diubah menjadi "${trimmed}".`);
      setEditingClassOldName(null);
    } else {
      if (classNames.includes(trimmed)) {
        showError('Nama kelas ini sudah ada.');
        return;
      }
      onUpdateClasses([...classNames, trimmed].sort());
      showNotification(`Kelas "${trimmed}" berhasil ditambahkan.`);
    }

    setNewClassNameInput('');
  };

  const handleDeleteClass = (classNameToDelete: string) => {
    const count = classStudentCounts[classNameToDelete] || 0;
    const msg = count > 0
      ? `Kelas "${classNameToDelete}" memiliki ${count} siswa terdaftar. Yakin ingin menghapus kelas ini dari daftar kelas?`
      : `Apakah Anda yakin ingin menghapus kelas "${classNameToDelete}"?`;

    setModalConfig({
      isOpen: true,
      title: 'Hapus Kelas',
      message: msg,
      confirmText: 'Ya, Hapus Kelas',
      type: 'danger',
      onConfirm: () => {
        const updatedClasses = classNames.filter((c) => c !== classNameToDelete);
        onUpdateClasses(updatedClasses);
        showNotification(`Kelas "${classNameToDelete}" dihapus.`);
        setModalConfig((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  // Handle Excel / CSV Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result;
        const workbook = XLSX.read(buffer, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (rawJson.length === 0) {
          showError('File Excel/CSV kosong.');
          return;
        }

        const parsedStudents: StudentInfo[] = [];

        rawJson.forEach((row) => {
          let name = '';
          let className = '';

          Object.keys(row).forEach((key) => {
            const cleanKey = key.toLowerCase().trim();
            const val = String(row[key]).trim();

            if (['nama', 'nama siswa', 'student', 'student name', 'name'].includes(cleanKey)) {
              name = val;
            } else if (['kelas', 'nama kelas', 'class', 'class name', 'classname'].includes(cleanKey)) {
              className = val;
            }
          });

          if (!name && row['__EMPTY']) name = String(row['__EMPTY']).trim();
          if (!className && row['__EMPTY_1']) className = String(row['__EMPTY_1']).trim();

          if (name && className) {
            parsedStudents.push({ name, className });
          }
        });

        if (parsedStudents.length === 0) {
          showError('Gagal mendeteksi kolom "Nama Siswa" dan "Kelas". Pastikan header tabel menggunakan "Nama" dan "Kelas".');
          return;
        }

        setPreviewData(parsedStudents);
      } catch (err) {
        console.error('Error parsing file:', err);
        showError('Gagal membaca file Excel/CSV. Pastikan format file valid.');
      }
    };

    reader.readAsBinaryString(file);
  };

  // Handle Parse Pasted Text (Copy-Paste directly from Excel or Word)
  const handleParsePastedText = () => {
    if (!pastedText.trim()) {
      showError('Silakan tempelkan teks tabel data siswa terlebih dahulu.');
      return;
    }

    const lines = pastedText.split('\n');
    const parsed: StudentInfo[] = [];

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      // Split by tab or comma or semicolon or pipe
      let parts = trimmed.split('\t');
      if (parts.length < 2) parts = trimmed.split(',');
      if (parts.length < 2) parts = trimmed.split(';');

      if (parts.length >= 2) {
        const name = parts[0].trim();
        const className = parts[1].trim();
        // Ignore header line if matched
        if (name.toLowerCase().includes('nama') && className.toLowerCase().includes('kelas')) {
          return;
        }
        if (name && className) {
          parsed.push({ name, className });
        }
      }
    });

    if (parsed.length === 0) {
      showError('Gagal memproses teks. Pastikan format tiap baris adalah "Nama [Tab atau Koma] Kelas".');
      return;
    }

    setPreviewData(parsed);
    setImportFileName('Teks Tempelan (Paste)');
  };

  const handleConfirmImport = async () => {
    if (previewData.length === 0) return;

    let finalStudents: StudentInfo[];
    if (importMode === 'replace') {
      finalStudents = [...previewData];
    } else {
      const existingMap = new Set(students.map((s) => `${s.name.toLowerCase()}|${s.className.toLowerCase()}`));
      const newItems = previewData.filter(
        (s) => !existingMap.has(`${s.name.toLowerCase()}|${s.className.toLowerCase()}`)
      );
      finalStudents = [...students, ...newItems];
    }

    const allImportedClasses = Array.from(
      new Set(
        [...classNames, ...finalStudents.map((s) => s.className.trim())].filter(Boolean)
      )
    ).sort();

    try {
  await simpanDatabaseSiswa(
    finalStudents,
    allImportedClasses,
    importMode
  );

  onUpdateStudents(finalStudents);
  onUpdateClasses(allImportedClasses);
} catch (error) {
  showError(
    error instanceof Error
      ? error.message
      : 'Gagal menyimpan database siswa ke Supabase.'
  );

  return;
}

    showNotification(`Berhasil menyimpan ${previewData.length} data siswa ke database!`);
    setPreviewData([]);
    setPastedText('');
    setImportFileName('');
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      { 'Nama Siswa': 'Ahmad Fauzi', 'Kelas': '1 Asiatic Cheetah' },
      { 'Nama Siswa': 'Siti Nurhaliza', 'Kelas': '2 Blue Whale' },
      { 'Nama Siswa': 'Budi Santoso', 'Kelas': '3 Saola' },
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data Siswa');
    XLSX.writeFile(wb, 'Template_Data_Siswa_LazGo.xlsx');
  };

  const handleExportDatabase = () => {
    const exportData = students.map((s) => ({
      'Nama Siswa': s.name,
      'Kelas': s.className,
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Database Siswa');
    XLSX.writeFile(wb, `Database_Siswa_LazGo_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification Success */}
      {notification && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-2xl animate-fade-in text-sm font-medium">
          <CheckIcon className="w-5 h-5 text-emerald-200" />
          <span>{notification}</span>
        </div>
      )}

      {/* Toast Notification Error */}
      {errorMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 bg-rose-600 text-white px-4 py-3 rounded-xl shadow-2xl animate-fade-in text-sm font-medium">
          <span className="font-bold">!</span>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Custom Confirmation Modal */}
      {modalConfig.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 dark:border-gray-700 space-y-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              {modalConfig.title}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
              {modalConfig.message}
            </p>
            <div className="flex justify-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setModalConfig((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={modalConfig.onConfirm}
                className={`px-4 py-2 text-xs font-semibold text-white rounded-lg shadow transition-colors ${
                  modalConfig.type === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-sky-600 hover:bg-sky-700'
                }`}
              >
                {modalConfig.confirmText || 'Konfirmasi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Database Header & Navigation */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-100 dark:border-gray-700">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-300 rounded-xl">
              <DatabaseIcon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Database Siswa & Kelas</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Kelola daftar nama siswa dan kelas untuk pencatatan keterlambatan
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleClearAllStudents}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 transition-colors"
              title="Hapus seluruh data siswa terdaftar (untuk tahun ajaran baru)"
            >
              <TrashIcon className="w-4 h-4 text-rose-600 dark:text-rose-400" /> Kosongkan Semua Siswa
            </button>
            <button
              onClick={handleExportDatabase}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors"
            >
              <DownloadIcon className="w-4 h-4" /> Export Excel
            </button>
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-sky-50 hover:bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 transition-colors"
            >
              <DownloadIcon className="w-4 h-4" /> Download Template
            </button>
          </div>
        </div>

        {/* Sub Navigation Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 space-x-6 text-sm font-medium">
          <button
            onClick={() => setActiveSubTab('students')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
              activeSubTab === 'students'
                ? 'border-sky-600 text-sky-600 dark:border-sky-400 dark:text-sky-400 font-semibold'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <UsersIcon className="w-4 h-4" /> Data Siswa ({students.length})
          </button>
          <button
            onClick={() => setActiveSubTab('classes')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
              activeSubTab === 'classes'
                ? 'border-sky-600 text-sky-600 dark:border-sky-400 dark:text-sky-400 font-semibold'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <ClassIcon className="w-4 h-4" /> Daftar Kelas ({classNames.length})
          </button>
          <button
            onClick={() => setActiveSubTab('import')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
              activeSubTab === 'import'
                ? 'border-sky-600 text-sky-600 dark:border-sky-400 dark:text-sky-400 font-semibold'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <UploadIcon className="w-4 h-4" /> Import Excel / CSV / Teks
          </button>
        </div>
      </div>

      {/* TAB 1: DATA SISWA */}
      {activeSubTab === 'students' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form Input Manual Siswa */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md h-fit">
            <h3 className="text-md font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
              <PlusIcon className="w-5 h-5 text-sky-600" />
              {editingStudentIndex !== null ? 'Edit Data Siswa' : 'Tambah Siswa Manual'}
            </h3>
            <form onSubmit={handleSaveStudent} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1">
                  Nama Lengkap Siswa
                </label>
                <input
                  type="text"
                  value={studentNameInput}
                  onChange={(e) => setStudentNameInput(e.target.value)}
                  placeholder="Contoh: Muhammad Budi"
                  required
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1">
                  Kelas
                </label>
                <input
                  type="text"
                  value={studentClassInput}
                  onChange={(e) => setStudentClassInput(e.target.value)}
                  placeholder="Contoh: 1 Asiatic Cheetah"
                  list="class-options"
                  required
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
                <datalist id="class-options">
                  {classNames.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2 px-4 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-semibold shadow transition-colors flex items-center justify-center gap-2"
                >
                  {editingStudentIndex !== null ? 'Simpan Perubahan' : 'Tambah Siswa'}
                </button>
                {editingStudentIndex !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingStudentIndex(null);
                      setStudentNameInput('');
                      setStudentClassInput('');
                    }}
                    className="py-2 px-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-semibold transition-colors"
                  >
                    Batal
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Tabel / Listing Siswa */}
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-md font-semibold text-gray-900 dark:text-white">
                Daftar Siswa Terdaftar ({filteredStudents.length})
              </h3>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative">
                  <SearchIcon className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Cari nama siswa..."
                    className="pl-9 pr-3 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:outline-none w-full sm:w-48"
                  />
                </div>
                <select
                  value={selectedClassFilter}
                  onChange={(e) => setSelectedClassFilter(e.target.value)}
                  className="px-3 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                >
                  <option value="">Semua Kelas</option>
                  {classNames.map((c) => (
                    <option key={c} value={c}>
                      {c} ({classStudentCounts[c] || 0})
                    </option>
                  ))}
                </select>
                {students.length > 0 && (
                  <button
                    onClick={handleClearAllStudents}
                    className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 dark:bg-rose-900/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-semibold rounded-lg border border-rose-200 dark:border-rose-800 transition-colors flex items-center gap-1"
                    title="Kosongkan seluruh data siswa"
                  >
                    <TrashIcon className="w-3.5 h-3.5" /> Hapus Semua
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg max-h-[500px]">
              <table className="w-full text-left text-sm text-gray-700 dark:text-gray-300">
                <thead className="text-xs uppercase bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 sticky top-0 z-10">
                  <tr>
                    <th className="py-3 px-4">No</th>
                    <th className="py-3 px-4">Nama Siswa</th>
                    <th className="py-3 px-4">Kelas</th>
                    <th className="py-3 px-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-gray-500 dark:text-gray-400">
                        Belum ada data siswa. Gunakan tombol "Import Excel / CSV" atau formulir tambah siswa di samping.
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((student, idx) => {
                      const originalIndex = students.indexOf(student);
                      return (
                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                          <td className="py-2.5 px-4 text-xs font-mono text-gray-500">{idx + 1}</td>
                          <td className="py-2.5 px-4 font-medium text-gray-900 dark:text-white">{student.name}</td>
                          <td className="py-2.5 px-4">
                            <span className="px-2.5 py-1 bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300 rounded-md text-xs font-semibold border border-sky-200 dark:border-sky-800">
                              {student.className}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleStartEditStudent(originalIndex)}
                                title="Edit Siswa"
                                className="p-1.5 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30 rounded-md transition-colors"
                              >
                                <EditIcon className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteStudent(originalIndex)}
                                title="Hapus Siswa"
                                className="p-1.5 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/30 rounded-md transition-colors"
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
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

      {/* TAB 2: DAFTAR KELAS */}
      {activeSubTab === 'classes' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form Input Kelas */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md h-fit">
            <h3 className="text-md font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
              <PlusIcon className="w-5 h-5 text-sky-600" />
              {editingClassOldName ? 'Edit Nama Kelas' : 'Tambah Kelas Baru'}
            </h3>
            <form onSubmit={handleSaveClass} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1">
                  Nama Kelas
                </label>
                <input
                  type="text"
                  value={newClassNameInput}
                  onChange={(e) => setNewClassNameInput(e.target.value)}
                  placeholder="Contoh: 1 Snow Leopard"
                  required
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2 px-4 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-semibold shadow transition-colors"
                >
                  {editingClassOldName ? 'Simpan Nama Kelas' : 'Tambah Kelas'}
                </button>
                {editingClassOldName && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingClassOldName(null);
                      setNewClassNameInput('');
                    }}
                    className="py-2 px-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-semibold"
                  >
                    Batal
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Grid Cards Kelas */}
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
            <h3 className="text-md font-semibold mb-4 text-gray-900 dark:text-white">
              Daftar Kelas Aktif ({classNames.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-1">
              {classNames.map((cName) => {
                const count = classStudentCounts[cName] || 0;
                return (
                  <div
                    key={cName}
                    className="p-3.5 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl flex items-center justify-between hover:border-sky-300 transition-all"
                  >
                    <div>
                      <h4 className="font-semibold text-sm text-gray-900 dark:text-white">{cName}</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{count} Siswa Terdaftar</p>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingClassOldName(cName);
                          setNewClassNameInput(cName);
                        }}
                        title="Edit Kelas"
                        className="p-1.5 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30 rounded-lg"
                      >
                        <EditIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteClass(cName)}
                        title="Hapus Kelas"
                        className="p-1.5 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/30 rounded-lg"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: IMPORT EXCEL / CSV / PASTE */}
      {activeSubTab === 'import' && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md space-y-6">
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Import Data Siswa Masal</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Gunakan file spreadsheet atau tempelkan daftar siswa secara langsung untuk input cepat.
              </p>
            </div>

            {/* Sub-toggle file vs paste */}
            <div className="flex justify-center border-b border-gray-200 dark:border-gray-700 pb-3 gap-4">
              <button
                onClick={() => setImportType('file')}
                className={`text-xs font-semibold pb-1 border-b-2 transition-colors ${
                  importType === 'file'
                    ? 'border-sky-600 text-sky-600 dark:border-sky-400 dark:text-sky-400'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                Upload File Excel / CSV
              </button>
              <button
                onClick={() => setImportType('paste')}
                className={`text-xs font-semibold pb-1 border-b-2 transition-colors ${
                  importType === 'paste'
                    ? 'border-sky-600 text-sky-600 dark:border-sky-400 dark:text-sky-400'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                Tempel Teks (Copy-Paste)
              </button>
            </div>

            {/* Upload Dropzone */}
            {importType === 'file' ? (
              <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-sky-500 dark:hover:border-sky-400 rounded-xl p-8 text-center bg-gray-50 dark:bg-gray-700/30 transition-all cursor-pointer relative">
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <UploadIcon className="w-10 h-10 mx-auto text-sky-500 mb-3" />
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Klik untuk memilih file Excel/CSV atau seret file ke sini
                </p>
                <p className="text-xs text-gray-400 mt-1">Format didukung: .xlsx, .xls, .csv</p>
                {importFileName && (
                  <div className="mt-3 inline-block bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200 text-xs px-3 py-1 rounded-full font-medium">
                    File terpilih: {importFileName}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Tempelkan daftar siswa dari Excel / Word / Google Sheets (Baris: Nama [Tab/Koma] Kelas)
                </label>
                <textarea
                  rows={6}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder={`Contoh:\nAhmad Fauzi\t1 Asiatic Cheetah\nSiti Nurhaliza\t2 Blue Whale\nBudi Santoso\t3 Saola`}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-xs font-mono text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleParsePastedText}
                  className="w-full py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow transition-colors"
                >
                  Proses Teks Tempelan
                </button>
              </div>
            )}

            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="text-xs text-sky-600 dark:text-sky-400 underline hover:text-sky-800 flex items-center gap-1 font-medium"
              >
                <DownloadIcon className="w-3.5 h-3.5" /> Unduh Contoh Template File Excel
              </button>
            </div>
          </div>

          {/* Preview Table parsed data */}
          {previewData.length > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-gray-900 dark:text-white text-md">
                    Pratinjau Data Impor ({previewData.length} siswa terdeteksi)
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Periksa kembali data sebelum menyimpan ke database.
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3 text-xs">
                    <label className="flex items-center gap-1 text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input
                        type="radio"
                        name="importMode"
                        value="merge"
                        checked={importMode === 'merge'}
                        onChange={() => setImportMode('merge')}
                        className="text-sky-600"
                      />
                      Gabungkan (Merge)
                    </label>
                    <label className="flex items-center gap-1 text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input
                        type="radio"
                        name="importMode"
                        value="replace"
                        checked={importMode === 'replace'}
                        onChange={() => setImportMode('replace')}
                        className="text-sky-600"
                      />
                      Gantikan Semua
                    </label>
                  </div>

                  <button
                    onClick={handleConfirmImport}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold shadow transition-colors flex items-center gap-2"
                  >
                    <CheckIcon className="w-4 h-4" /> Simpan Ke Database ({previewData.length})
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg max-h-80">
                <table className="w-full text-left text-sm text-gray-700 dark:text-gray-300">
                  <thead className="text-xs uppercase bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 sticky top-0">
                    <tr>
                      <th className="py-2.5 px-4">No</th>
                      <th className="py-2.5 px-4">Nama Siswa</th>
                      <th className="py-2.5 px-4">Kelas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {previewData.slice(0, 100).map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="py-2 px-4 text-xs text-gray-400 font-mono">{idx + 1}</td>
                        <td className="py-2 px-4 font-medium text-gray-900 dark:text-white">{row.name}</td>
                        <td className="py-2 px-4">
                          <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded text-xs">
                            {row.className}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {previewData.length > 100 && (
                <p className="text-xs text-gray-500 text-center italic">
                  Menampilkan 100 dari {previewData.length} baris... Semuanya akan disimpan setelah Anda menekan tombol simpan.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
