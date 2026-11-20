import { Client, Quarry, Stockpile, Survey, Zone } from '../types.ts';
import { buildClientFolderName } from './folderUtils.ts';
import { getAuthToken } from './stockpilePhotoUtils.ts';

interface FlightCleanupTarget {
  surveyId: number;
  flightCode?: string;
  flightNotes?: string;
  clientCode?: string;
  clientName?: string;
  clientFolder?: string;
  altClientFolder?: string;
}

interface CleanupScopePayload {
  scope: 'client' | 'quarry' | 'zone' | 'flight';
  clientId?: number;
  clientCode?: string;
  clientName?: string;
  clientFolder?: string;
  altClientFolder?: string;
  quarryIds?: number[];
  surveyIds?: number[];
  stockpileIds?: number[];
  flights?: FlightCleanupTarget[];
}

function buildClientFolderPair(client?: Pick<Client, 'id' | 'code' | 'name'>) {
  if (!client) return { clientFolder: undefined, altClientFolder: undefined };
  const primary = buildClientFolderName(client.code, client.name);
  const alt = buildClientFolderName(client.code, client.name, client.id);
  return {
    clientFolder: primary,
    altClientFolder: alt !== primary ? alt : undefined,
  };
}

async function postCleanupScope(payload: CleanupScopePayload): Promise<void> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  try {
    await fetch('/api/storage/cleanup-scope', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(payload),
    });
  } catch {
    // Non-blocking when offline or endpoint unavailable
  }
}

export async function cleanupClientStorage(params: {
  client: Client;
  quarries: Quarry[];
  surveys: Survey[];
  stockpiles: Stockpile[];
}): Promise<void> {
  const { client, quarries, surveys, stockpiles } = params;
  const { clientFolder, altClientFolder } = buildClientFolderPair(client);
  await postCleanupScope({
    scope: 'client',
    clientId: client.id,
    clientCode: client.code,
    clientName: client.name,
    clientFolder,
    altClientFolder,
    quarryIds: quarries.map((q) => q.id),
    surveyIds: surveys.map((s) => s.id),
    stockpileIds: stockpiles.map((st) => st.id),
    flights: surveys.map((s) => ({
      surveyId: s.id,
      flightCode: s.flightCode,
      flightNotes: s.notes,
      clientCode: client.code,
      clientName: client.name,
      clientFolder,
      altClientFolder,
    })),
  });
}

export async function cleanupQuarryStorage(params: {
  quarry: Quarry;
  client?: Client;
  surveys: Survey[];
  stockpiles: Stockpile[];
}): Promise<void> {
  const { quarry, client, surveys, stockpiles } = params;
  const { clientFolder, altClientFolder } = buildClientFolderPair(client);
  await postCleanupScope({
    scope: 'quarry',
    clientId: client?.id ?? quarry.clientId,
    clientCode: client?.code,
    clientName: client?.name,
    clientFolder,
    altClientFolder,
    quarryIds: [quarry.id],
    surveyIds: surveys.map((s) => s.id),
    stockpileIds: stockpiles.map((st) => st.id),
    flights: surveys.map((s) => ({
      surveyId: s.id,
      flightCode: s.flightCode,
      flightNotes: s.notes,
      clientCode: client?.code,
      clientName: client?.name,
      clientFolder,
      altClientFolder,
    })),
  });
}

export async function cleanupZoneStorage(params: {
  zone: Zone;
  quarry?: Quarry;
  client?: Client;
  surveys: Survey[];
  stockpiles: Stockpile[];
}): Promise<void> {
  const { quarry, client, surveys, stockpiles } = params;
  const { clientFolder, altClientFolder } = buildClientFolderPair(client);
  await postCleanupScope({
    scope: 'zone',
    clientId: client?.id ?? quarry?.clientId,
    clientCode: client?.code,
    clientName: client?.name,
    clientFolder,
    altClientFolder,
    surveyIds: surveys.map((s) => s.id),
    stockpileIds: stockpiles.map((st) => st.id),
    flights: surveys.map((s) => ({
      surveyId: s.id,
      flightCode: s.flightCode,
      flightNotes: s.notes,
      clientCode: client?.code,
      clientName: client?.name,
      clientFolder,
      altClientFolder,
    })),
  });
}

export async function cleanupFlightStorage(params: {
  flight: Survey;
  client?: Client;
  stockpiles: Stockpile[];
}): Promise<void> {
  const { flight, client, stockpiles } = params;
  const { clientFolder, altClientFolder } = buildClientFolderPair(client);
  await postCleanupScope({
    scope: 'flight',
    clientId: client?.id,
    clientCode: client?.code,
    clientName: client?.name,
    clientFolder,
    altClientFolder,
    surveyIds: [flight.id],
    stockpileIds: stockpiles.map((st) => st.id),
    flights: [
      {
        surveyId: flight.id,
        flightCode: flight.flightCode,
        flightNotes: flight.notes,
        clientCode: client?.code,
        clientName: client?.name,
        clientFolder,
        altClientFolder,
      },
    ],
  });
}
