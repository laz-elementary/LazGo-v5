
export type TardinessType = 'kedatangan' | 'kepulangan';

export interface StudentData {
   id: string;
  databaseId?: string;
  schoolStartTime: string;
  durationMinutes: number;
  category: TardinessCategory;
  tardinessType?: TardinessType;
}

export enum TardinessCategory {
  Ringan = 'Ringan', // Mild
  Sedang = 'Sedang', // Moderate
  Berat = 'Berat',   // Severe
}

export interface TardinessRecord extends StudentData {
  id: string;
  schoolStartTime: string;
  durationMinutes: number;
  category: TardinessCategory;
  tardinessType?: TardinessType;
}

export interface GeneratedOutput {
  summary: string;
  whatsapp: string;
  dailyRecap: string;
}
