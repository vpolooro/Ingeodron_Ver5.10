export interface AppUser {
  id: number;
  uid: string;
  username?: string;
  email: string;
  password?: string;
  displayName?: string;
  role: 'admin' | 'client';
  clientId?: number;
  active?: boolean;
  createdAt?: string;
}

export interface Client {
  id: number;
  code: string;
  name: string;
  cif: string;
  contactName: string;
  contactEmail: string;
  phone?: string;
  notes?: string;
  logoUrl?: string;
  viewer3dEnabled?: boolean;
  createdAt?: string;
}

export interface Quarry {
  id: number;
  clientId: number;
  name: string;
  code: string;
  location: string;
  status: 'active' | 'in_restoration' | 'inactive';
  createdAt?: string;
}

export interface Zone {
  id: number;
  quarryId: number;
  name: string;
  code: string;
  status: 'active' | 'inactive';
  createdAt?: string;
}

export type SurveyStatus = 'active' | 'archived' | 'pending';

export interface Survey {
  id: number;
  zoneId: number;
  status?: SurveyStatus;
  surveyDate: string;
  flightCode: string;
  droneModel: string;
  operator: string;
  cutVolumeM3: number;
  fillVolumeM3: number;
  netVolumeM3: number;
  tonnageEst: number;
  pointCount?: number;
  groundResolutionCm?: number;
  notes?: string;
  rawPointDataJson?: string;
  createdAt?: string;
}

export interface Stockpile {
  id: number;
  surveyId: number;
  name: string;
  code: string;
  stockpileType: 'stockpile' | 'bench_extraction' | 'fill_dump' | 'basin';
  material: string;
  densityTonM3: number;
  baseElevationM: number;
  areaM2?: number;
  cutVolumeM3: number;
  fillVolumeM3: number;
  netVolumeM3: number;
  tonnageEst: number;
  notes?: string;
  photoUrl?: string;
  photoFileName?: string;
  createdAt?: string;
}

export interface Deliverable {
  id: number;
  quarryId: number;
  surveyId?: number;
  clientCode?: string;
  clientName?: string;
  clientFolder?: string;
  flightSubFolder?: string;
  title: string;
  category: 'orthophoto' | 'contour_dxf' | 'pointcloud_las' | 'mesh_obj' | 'pdf_report' | 'gis_geotiff';
  fileUrl: string;
  shareUrl?: string;
  relativePath?: string;
  fileName: string;
  fileSize: string;
  crs: string;
  uploadDate: string;
  hasPhysicalFile?: boolean;
  isServerStored?: boolean;
  createdAt?: string;
}

export interface DxfPoint3D {
  x: number;
  y: number;
  z: number;
}

export interface DxfPolygonRegion {
  id: string;
  index: number;
  layer: string;
  label: string;
  color: string;
  closed: boolean;
  vertices: DxfPoint3D[];
  surfaceTriangles?: [DxfPoint3D, DxfPoint3D, DxfPoint3D][];
  areaM2: number;
  perimeterM: number;
  centroid: DxfPoint3D;
  minZ: number;
  maxZ: number;
  meanZ: number;
  stockpileId?: number | null;
  visible?: boolean;
}

export interface FlightDxfOverlay {
  surveyId: number;
  quarryId?: number;
  clientId?: number;
  clientCode?: string;
  clientName?: string;
  clientFolder: string;
  flightSubFolder: string;
  flightCode: string;
  fileName: string;
  storedFileName: string;
  fileSize: string;
  relativePath: string;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  polygons: DxfPolygonRegion[];
  surfaceCount: number;
  uploadedAt: string;
  updatedAt: string;
}

