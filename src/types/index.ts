export interface PrinterStatus {
  state: 'printing' | 'paused' | 'idle' | 'error' | 'disconnected';
  progress: number; // 0-100
  filename: string | null;
  extruderTemp: number;
  extruderTarget: number;
  bedTemp: number;
  bedTarget: number;
  timeRemaining: number | null; // en secondes
  printDuration: number | null; // en secondes
  thumbnail: string | null; // URL du thumbnail
  timestamp: number;
}

export interface MoonrakerQueryResponse {
  result: {
    status: {
      heater_bed?: {
        temperature: number;
        target: number;
      };
      extruder?: {
        temperature: number;
        target: number;
      };
      print_stats?: {
        state: string;
        filename: string;
        print_duration: number;
      };
      display_status?: {
        progress: number;
      };
      virtual_sdcard?: {
        progress: number;
        file_position: number;
      };
    };
  };
}

export interface MoonrakerJobResponse {
  result: {
    status: {
      print_stats: {
        state: string;
        filename: string;
        print_duration: number;
        filament_used: number;
      };
    };
  };
}
