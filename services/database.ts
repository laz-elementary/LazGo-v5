import { supabase } from "./supabase";
import {
  TardinessCategory,
  TardinessRecord,
  TardinessType,
} from "../types";
import type { StudentInfo } from "../data/students";

type DatabaseRow = {
  id: string;
  created_at: string;
  tanggal: string;
  kategori: string;
  nama_siswa: string;
  kelas: string;
  jam_standar: string | null;
  jam_aktual: string | null;
  alasan: string | null;
  pesan_orang_tua: string | null;
};

function hitungDurasi(
  jamStandar: string,
  jamAktual: string
): number {
  const standar = new Date(
    `1970-01-01T${jamStandar}:00`
  );

  const aktual = new Date(
    `1970-01-01T${jamAktual}:00`
  );

  const durasi = Math.round(
    (aktual.getTime() - standar.getTime()) / 60000
  );

  return Math.max(0, durasi);
}

function ubahMenjadiRecord(
  row: DatabaseRow
): TardinessRecord {
  const jamStandar = row.jam_standar || "07:30";
  const jamAktual = row.jam_aktual || jamStandar;

  const jenis: TardinessType =
    jamStandar >= "12:00"
      ? "kepulangan"
      : "kedatangan";

  return {
    databaseId: row.id,

    // App LazGo memakai id sebagai tanggal/waktu.
    id: row.created_at,

    name: row.nama_siswa,
    className: row.kelas,
    arrivalTime: jamAktual,
    targetTime: jamStandar,
    schoolStartTime: jamStandar,
    durationMinutes: hitungDurasi(
      jamStandar,
      jamAktual
    ),
    category:
      row.kategori as TardinessCategory,
    reason: row.alasan || "",
    tardinessType: jenis,
  };
}

export async function ambilSemuaData():
Promise<TardinessRecord[]> {
  const { data, error } = await supabase
    .from("keterlambatan")
    .select("*")
    .order("created_at", {
      ascending: true,
    });

  if (error) {
    throw new Error(
      `Gagal mengambil data: ${error.message}`
    );
  }

  return (data ?? []).map((row) =>
    ubahMenjadiRecord(row as DatabaseRow)
  );
}

export async function simpanData(
  record: TardinessRecord
): Promise<TardinessRecord> {
  const { data, error } = await supabase
    .from("keterlambatan")
    .insert({
      tanggal: record.id.slice(0, 10),
      kategori: record.category,
      nama_siswa: record.name,
      kelas: record.className,
      jam_standar: record.schoolStartTime,
      jam_aktual: record.arrivalTime,
      alasan: record.reason || "",
      pesan_orang_tua: "",
    })
    .select()
    .single();

  if (error) {
    throw new Error(
      `Gagal menyimpan data: ${error.message}`
    );
  }

  return ubahMenjadiRecord(
    data as DatabaseRow
  );
}

export async function hapusData(
  databaseId: string
): Promise<void> {
  const { error } = await supabase
    .from("keterlambatan")
    .delete()
    .eq("id", databaseId);

  if (error) {
    throw new Error(
      `Gagal menghapus data: ${error.message}`
    );
  }
}

export async function simpanDatabaseSiswa(
  students: StudentInfo[],
  classNames: string[],
  mode: "replace" | "merge"
): Promise<void> {
  if (mode === "replace") {
    const { error: deleteStudentsError } = await supabase
      .from("students")
      .delete()
      .not("id", "is", null);

    if (deleteStudentsError) {
      throw new Error(
        `Gagal menghapus data siswa lama: ${deleteStudentsError.message}`
      );
    }

    const { error: deleteClassesError } = await supabase
      .from("classes")
      .delete()
      .not("id", "is", null);

    if (deleteClassesError) {
      throw new Error(
        `Gagal menghapus data kelas lama: ${deleteClassesError.message}`
      );
    }
  }

  const studentRows = students
    .map((student) => ({
      name: student.name.trim(),
      class_name: student.className.trim(),
    }))
    .filter(
      (student) =>
        student.name !== "" &&
        student.class_name !== ""
    );

  if (studentRows.length > 0) {
    const { error } = await supabase
      .from("students")
      .upsert(studentRows, {
        onConflict: "name,class_name",
      });

    if (error) {
      throw new Error(
        `Gagal menyimpan siswa: ${error.message}`
      );
    }
  }

  const classRows = Array.from(
    new Set(
      classNames
        .map((className) => className.trim())
        .filter(Boolean)
    )
  ).map((name) => ({ name }));

  if (classRows.length > 0) {
    const { error } = await supabase
      .from("classes")
      .upsert(classRows, {
        onConflict: "name",
      });

    if (error) {
      throw new Error(
        `Gagal menyimpan kelas: ${error.message}`
      );
    }
  }
}

export async function ambilDatabaseSiswa(): Promise<{
  students: StudentInfo[];
  classNames: string[];
}> {
  const {
    data: studentRows,
    error: studentError,
  } = await supabase
    .from("students")
    .select("name, class_name")
    .order("class_name", { ascending: true })
    .order("name", { ascending: true });

  if (studentError) {
    throw new Error(
      `Gagal mengambil database siswa: ${studentError.message}`
    );
  }

  const {
    data: classRows,
    error: classError,
  } = await supabase
    .from("classes")
    .select("name")
    .order("name", { ascending: true });

  if (classError) {
    throw new Error(
      `Gagal mengambil database kelas: ${classError.message}`
    );
  }

  const students: StudentInfo[] =
    (studentRows ?? []).map((student) => ({
      name: student.name,
      className: student.class_name,
    }));

  const classNames =
    (classRows ?? []).map((kelas) => kelas.name);

  return {
    students,
    classNames,
  };
}

export async function tambahSiswaManual(
  student: StudentInfo
): Promise<void> {
  const name = student.name.trim();
  const className = student.className.trim();

  const { error: classError } = await supabase
    .from("classes")
    .upsert(
      { name: className },
      { onConflict: "name" }
    );

  if (classError) {
    throw new Error(
      `Gagal menyimpan kelas: ${classError.message}`
    );
  }

  const { error: studentError } = await supabase
    .from("students")
    .upsert(
      {
        name,
        class_name: className,
      },
      {
        onConflict: "name,class_name",
      }
    );

  if (studentError) {
    throw new Error(
      `Gagal menyimpan siswa: ${studentError.message}`
    );
  }
}

export async function ubahSiswaManual(
  studentLama: StudentInfo,
  studentBaru: StudentInfo
): Promise<void> {
  const newName = studentBaru.name.trim();
  const newClassName = studentBaru.className.trim();

  const { error: classError } = await supabase
    .from("classes")
    .upsert(
      { name: newClassName },
      { onConflict: "name" }
    );

  if (classError) {
    throw new Error(
      `Gagal menyimpan kelas: ${classError.message}`
    );
  }

  const { error: studentError } = await supabase
    .from("students")
    .update({
      name: newName,
      class_name: newClassName,
    })
    .eq("name", studentLama.name)
    .eq("class_name", studentLama.className);

  if (studentError) {
    throw new Error(
      `Gagal memperbarui siswa: ${studentError.message}`
    );
  }
}
