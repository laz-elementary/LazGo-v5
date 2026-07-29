
export type TardinessType = 'kedatangan' | 'kepulangan';

export interface StudentData {
  name: string;
  className: string;
  arrivalTime: string;
  tardinessType?: TardinessType; // 'kedatangan' or 'kepulangan'
  targetTime?: string;           // Standard time e.g., '07:30' or '14:00'
  reason?: string;
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
