import type { Polygon } from 'geojson';
export type { Polygon } from 'geojson';

export interface User { id: string; full_name: string; email: string; created_at: string }
export interface Project { id: string; owner_id: string; name: string; description: string; created_at: string; is_demo: boolean }
export interface Site { id: string; project_id: string; name: string; boundary: Polygon; area_hectares: number; created_at: string }
export interface Summary { project_id: string; site_count: number; area_hectares: number; carbon_tonnes_co2e: number | null; biodiversity_score: number | null; latest_measurement: string | null; has_mock_data: boolean }
export interface Measurement { recorded_on: string; carbon_tonnes_co2e: number; biodiversity_score: number; is_mock: boolean }
export interface Token { access_token: string; token_type: string; expires_in: number }
