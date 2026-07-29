import { supabase } from "./supabase";

export type DataKeterlambatan = {
  tanggal: string;
  kategori: string;
  nama_siswa: string;
  kelas: string;
  jam_standar: string;
  jam_aktual: string;
  alasan: string;
  pesan_orang_tua: string;
};

// Mengambil seluruh data dari Supabase
export async function ambilSemuaData() {
  const { data, error } = await supabase
    .from("keterlambatan")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Gagal mengambil data: ${error.message}`);
  }

  return data ?? [];
}

// Menyimpan satu data baru ke Supabase
export async function simpanData(dataBaru: DataKeterlambatan) {
  const { data, error } = await supabase
    .from("keterlambatan")
    .insert([dataBaru])
    .select()
    .single();

  if (error) {
    throw new Error(`Gagal menyimpan data: ${error.message}`);
  }

  return data;
}
