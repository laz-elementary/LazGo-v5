export type TardinessType =
  | 'kedatangan'
  | 'kepulangan';

export interface StudentData {
  name: string;
  className: string;
  arrivalTime: string;
  tardinessType?: TardinessType;
  targetTime: string;
  reason: string;
}

export enum TardinessCategory {
  Ringan = 'Ringan',
  Sedang = 'Sedang',
  Berat = 'Berat',
}

export interface TardinessRecord
  extends StudentData {
  id: string;
  databaseId?: string;
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
