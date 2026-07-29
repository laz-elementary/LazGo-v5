import { GoogleGenAI, Type } from "@google/genai";
import { TardinessRecord, GeneratedOutput } from '../types';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

function formatHistory(records: TardinessRecord[]): string {
  if (records.length === 0) {
    return "Belum ada siswa yang terlambat hari ini selain siswa saat ini.";
  }
  return records.map(r => `- ${r.name} (${r.className}): Terlambat ${r.durationMinutes} menit (${r.category})`).join('\n');
}

export async function generateTardinessReport(
  currentRecord: TardinessRecord,
  history: TardinessRecord[],
  monthlyCount: number = 1
): Promise<GeneratedOutput> {
  const todayFormatted = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const isKepulangan = currentRecord.tardinessType === 'kepulangan';
  const standardTime = currentRecord.targetTime || currentRecord.schoolStartTime || (isKepulangan ? '14:00' : '07:30');
  const isMultipleOfThree = monthlyCount > 0 && monthlyCount % 3 === 0;

  // Notice for kelipatan 3 (3, 6, 9, dst.)
  const disciplineNotice = isMultipleOfThree
    ? `\n\n*⚠️ PEMBERITAHUAN KEDISIPLINAN (KELIPATAN 3):*\nMemberitahukan bahwa ananda telah tercatat *${monthlyCount} kali* terlambat pada bulan ini. Sesuai ketentuan sekolah, mohon perhatian khusus dan kerja sama dari Bapak/Ibu di rumah untuk evaluasi keterlambatan ananda.`
    : ``;

  // Fallback instant templates
  const defaultWhatsAppKedatangan = `Yth. Bapak/Ibu Orang Tua/Wali dari *Ananda ${currentRecord.name}* (${currentRecord.className}),

Assalamu'alaikum Wr. Wb. / Selamat Pagi/Siang,

Memberitahukan bahwa ananda pada hari ini (*${todayFormatted}*) tercatat hadir di sekolah pada pukul *${currentRecord.arrivalTime} WIB* (Jam masuk: ${standardTime} WIB, keterlambatan: *${currentRecord.durationMinutes} menit*).

*Alasan Keterlambatan:* ${currentRecord.reason || 'Tidak disampaikan'}${disciplineNotice}

Mohon bantuan dan bimbingan Bapak/Ibu di rumah agar ananda dapat hadir tepat waktu pada hari berikutnya. Terima kasih atas perhatian dan kerja samanya.

Wassalamu'alaikum Wr. Wb.
_SD Lazuardi_`;

  const defaultWhatsAppKepulangan = `Yth. Bapak/Ibu Orang Tua/Wali dari *Ananda ${currentRecord.name}* (${currentRecord.className}),

Assalamu'alaikum Wr. Wb. / Selamat Sore,

Memberitahukan bahwa ananda pada hari ini (*${todayFormatted}*) tercatat dijemput/pulang pada pukul *${currentRecord.arrivalTime} WIB* (Jam kepulangan sekolah: ${standardTime} WIB, keterlambatan penjemputan: *${currentRecord.durationMinutes} menit*).

*Catatan / Alasan Penjemputan:* ${currentRecord.reason || 'Tidak disampaikan'}${disciplineNotice}

Mohon perhatian dan kesediaannya agar ananda dapat dijemput tepat waktu demi keamanan dan kenyamanan ananda di sekolah. Terima kasih atas perhatian dan kerja samanya.

Wassalamu'alaikum Wr. Wb.
_SD Lazuardi_`;

  const defaultWhatsApp = isKepulangan ? defaultWhatsAppKepulangan : defaultWhatsAppKedatangan;

  const prompt = isKepulangan
    ? `
    Kamu adalah asisten sekolah Lazuardi (LazGo).
    Buatkan pesan pengantar WhatsApp yang sangat sopan, empati, dan formal untuk orang tua/wali siswa terkait KETERLAMBATAN PENJEMPUTAN / KEPULANGAN SISWA.

    Data Keterlambatan Kepulangan:
    - Nama Siswa: ${currentRecord.name}
    - Kelas: ${currentRecord.className}
    - Hari & Tanggal: ${todayFormatted}
    - Jam Penjemputan/Pulang: ${currentRecord.arrivalTime} WIB
    - Jam Kepulangan Sekolah: ${standardTime} WIB
    - Durasi Keterlambatan Penjemputan: ${currentRecord.durationMinutes} menit (${currentRecord.category})
    - Catatan/Alasan dari Guru Piket: ${currentRecord.reason || 'Tidak ada'}
    - Total Keterlambatan Bulan Ini: ${monthlyCount} kali ${isMultipleOfThree ? '(SUDAH MENCAPAI KELIPATAN 3 KETERLAMBATAN!)' : ''}

    Sapa dengan "Yth. Bapak/Ibu Orang Tua/Wali dari *Ananda ${currentRecord.name}* (${currentRecord.className})".
    Sampaikan dengan santun bahwa ananda baru dijemput/pulang pada pukul ${currentRecord.arrivalTime} WIB (Jam pulang: ${standardTime} WIB).
    ${
      isMultipleOfThree
        ? `SANGAT PENTING: Tambahkan alinea khusus pemberitahuan kedisiplinan bahwa ananda sudah ${monthlyCount} kali terlambat di bulan ini (kelipatan 3), serta ajakan kerja sama/evaluasi bersama orang tua.`
        : ''
    }
    Akhiri pesan dengan salam penutup Wassalamu'alaikum Wr. Wb. dan tanda tangan "_SD Lazuardi_" di baris terakhir. JANGAN gunakan "Tim Kedisiplinan".
    Gunakan bold (*...*) dan italic (_..._) khas WhatsApp.
    JANGAN tambahkan teks pembuka/penutup lain selain isi pesan WhatsApp yang siap dicopas.
  `
    : `
    Kamu adalah asisten sekolah Lazuardi (LazGo).
    Buatkan pesan pengantar WhatsApp yang sangat sopan, empati, dan formal untuk orang tua/wali siswa terkait KETERLAMBATAN KEDATANGAN SISWA.

    Data Keterlambatan Kedatangan:
    - Nama Siswa: ${currentRecord.name}
    - Kelas: ${currentRecord.className}
    - Hari & Tanggal: ${todayFormatted}
    - Jam Kedatangan: ${currentRecord.arrivalTime} WIB
    - Jam Masuk Sekolah: ${standardTime} WIB
    - Durasi Keterlambatan: ${currentRecord.durationMinutes} menit (${currentRecord.category})
    - Alasan: ${currentRecord.reason || 'Tidak ada'}
    - Total Keterlambatan Bulan Ini: ${monthlyCount} kali ${isMultipleOfThree ? '(SUDAH MENCAPAI KELIPATAN 3 KETERLAMBATAN!)' : ''}

    Sapa dengan "Yth. Bapak/Ibu Orang Tua/Wali dari *Ananda ${currentRecord.name}* (${currentRecord.className})".
    Sampaikan dengan santun bahwa ananda tiba di sekolah pukul ${currentRecord.arrivalTime} WIB.
    ${
      isMultipleOfThree
        ? `SANGAT PENTING: Tambahkan alinea khusus pemberitahuan kedisiplinan bahwa ananda sudah ${monthlyCount} kali terlambat di bulan ini (kelipatan 3), serta ajakan kerja sama/evaluasi bersama orang tua.`
        : ''
    }
    Akhiri pesan dengan salam penutup Wassalamu'alaikum Wr. Wb. dan tanda tangan "_SD Lazuardi_" di baris terakhir. JANGAN gunakan "Tim Kedisiplinan".
    Gunakan bold (*...*) dan italic (_..._) khas WhatsApp.
    JANGAN tambahkan teks pembuka/penutup lain selain isi pesan WhatsApp yang siap dicopas.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const whatsapp = response.text ? response.text.trim() : defaultWhatsApp;

    return {
      summary: `Siswa ${currentRecord.name} (${currentRecord.className}) terlambat ${isKepulangan ? 'penjemputan' : 'kedatangan'} ${currentRecord.durationMinutes} menit.`,
      whatsapp: whatsapp,
      dailyRecap: `Total siswa tercatat terlambat hari ini: ${history.length + 1} siswa.`,
    };
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return {
      summary: `Siswa ${currentRecord.name} (${currentRecord.className}) terlambat ${isKepulangan ? 'penjemputan' : 'kedatangan'} ${currentRecord.durationMinutes} menit.`,
      whatsapp: defaultWhatsApp,
      dailyRecap: `Total siswa tercatat terlambat hari ini: ${history.length + 1} siswa.`,
    };
  }
}


export async function generateMonthlyReport(records: TardinessRecord[]): Promise<{
  report: string;
  parentMessage: string | null;
  topOffender: { name: string; className: string; count: number } | null;
}> {
    if (records.length === 0) {
        return { report: "Tidak ada data keterlambatan untuk bulan ini.", parentMessage: null, topOffender: null };
    }

    // 1. Find top offender
    const tardinessCounts: Record<string, { name: string; className: string; count: number }> = {};
    for (const record of records) {
        if (!tardinessCounts[record.name]) {
            tardinessCounts[record.name] = { name: record.name, className: record.className, count: 0 };
        }
        tardinessCounts[record.name].count++;
    }

    const topOffender = Object.values(tardinessCounts).sort((a, b) => b.count - a.count)[0];
    
    // Condition: Only generate a message if someone is late 3 or more times.
    const shouldGenerateParentMessage = topOffender && topOffender.count >= 3;

    const formattedData = records.map(r => 
        `- Tgl: ${new Date(r.id).toLocaleDateString('id-ID')}, Nama: ${r.name}, Kelas: ${r.className}, Terlambat: ${r.durationMinutes} menit, Kategori: ${r.category}`
    ).join('\n');

    // 2. Build the prompt
    const prompt = `
        Kamu adalah LazGo, seorang analis data sekolah yang cermat dan profesional.
        
        Data Keterlambatan Bulan Ini:
        ${formattedData}
        
        ---
        
        Instruksi:
        Berdasarkan data di atas, hasilkan objek JSON dengan struktur yang TEPAT sebagai berikut:
        {
          "report": "string (dalam format markdown)",
          "parentMessage": "string atau null"
        }
        
        1.  Untuk kunci "report":
            Buatlah laporan analisis markdown yang komprehensif. Laporan harus mencakup:
            - **Laporan Analisis Keterlambatan Bulanan** (sebagai judul utama)
            - **1. Ringkasan Umum**: Total keterlambatan, rata-rata durasi, rincian per kategori.
            - **2. Tren dan Pola Utama**: Identifikasi tren menonjol.
            - **3. Siswa dengan Keterlambatan Terbanyak**: Sebutkan 3-5 siswa teratas beserta jumlah keterlambatannya.
            - **4. Rekomendasi**: Berikan 1-2 rekomendasi singkat dan dapat ditindaklanjuti.
        
        ${shouldGenerateParentMessage
          ? `2. Untuk kunci "parentMessage":
            Siswa yang paling sering terlambat adalah **${topOffender.name}** dari kelas **${topOffender.className}** dengan total **${topOffender.count}** kali keterlambatan.
            Buatkan draf pesan WhatsApp yang formal, sopan, dan konstruktif untuk orang tua/wali siswa tersebut. Tujuannya adalah untuk memberitahu, mengungkapkan keprihatinan, dan mengajak berdiskusi untuk mencari solusi bersama. Awali dengan "Yth. Bapak/Ibu Orang Tua/Wali dari ananda ${topOffender.name}". Jelaskan jumlah keterlambatannya dan sampaikan harapan untuk bekerja sama.`
          : `2. Untuk kunci "parentMessage":
            Karena tidak ada siswa dengan jumlah keterlambatan yang signifikan (kurang dari 3 kali), kembalikan nilai null untuk kunci ini.`
        }
    `;

    // 3. API Call
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
            }
        });

        const resultJsonString = response.text;
        const resultJson = JSON.parse(resultJsonString);
        
        return {
            report: resultJson.report || "Gagal memuat laporan dari AI.",
            parentMessage: resultJson.parentMessage,
            topOffender: shouldGenerateParentMessage ? topOffender : null,
        };

    } catch (error) {
        console.error("Error calling Gemini API for monthly report:", error);
        throw new Error("Gagal memproses laporan bulanan dari AI. Format respons mungkin tidak valid.");
    }
}
