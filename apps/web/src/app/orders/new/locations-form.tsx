'use client';

import { useState } from 'react';

import {
  useAddressSearch,
  type AddressCandidate,
} from './addresses';

/**
 * Locations step of the new-order wizard.
 *
 * Pickup and destination are each entered as a typed address, with
 * autocomplete suggestions from the server-side geocoder (Stadia — the API
 * key never reaches the browser). Two manual fallbacks are always available
 * when the geocoder has no results or is unavailable: a plain typed address
 * with manually entered coordinates, and a typed address without
 * coordinates (server-side geocoding will be attempted when the quote is
 * requested). No coordinates are ever computed in the browser.
 */

interface ResolvedPoint {
  readonly address: string;
  /** Present when the geocoder resolved the address. */
  readonly lat: number | null;
  readonly lng: number | null;
}

export interface LocationsResult {
  readonly pickup: ResolvedPoint;
  readonly dropoff: ResolvedPoint;
}

interface LocationsFormProps {
  onBack: () => void;
  onContinue: (result: LocationsResult) => void;
}

interface FieldErrors {
  pickup?: string;
  dropoff?: string;
}

function CoordinateFields(props: {
  latValue: string;
  lngValue: string;
  onLatChange: (value: string) => void;
  onLngChange: (value: string) => void;
}) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      <div>
        <label className="block text-xs font-medium text-neutral-500">
          Latitude (e.g. 9.0578)
        </label>
        <input
          type="text"
          inputMode="decimal"
          value={props.latValue}
          onChange={(event) => props.onLatChange(event.target.value)}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          placeholder="9.0578"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-500">
          Longitude (e.g. 7.4951)
        </label>
        <input
          type="text"
          inputMode="decimal"
          value={props.lngValue}
          onChange={(event) => props.onLngChange(event.target.value)}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
          placeholder="7.4951"
        />
      </div>
    </div>
  );
}

function LocationField(props: {
  label: string;
  hint: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  candidates: AddressCandidate[];
  searching: boolean;
  unavailable: boolean;
  onSelect: (candidate: AddressCandidate) => void;
  showManual: boolean;
  onToggleManual: () => void;
  manualLat: string;
  manualLng: string;
  onManualLatChange: (value: string) => void;
  onManualLngChange: (value: string) => void;
}) {
  const hasSuggestions = props.candidates.length > 0;
  return (
    <div className="space-y-1">
      <label htmlFor={`location-${props.label}`} className="block text-sm font-medium">
        {props.label}
      </label>
      <p className="text-xs text-neutral-500">{props.hint}</p>
      <input
        id={`location-${props.label}`}
        type="text"
        autoComplete="off"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-base focus:border-neutral-900 focus:outline-none"
        placeholder="Type an address"
      />
      {props.searching ? (
        <p className="text-xs text-neutral-400">Searching addresses…</p>
      ) : null}
      {hasSuggestions ? (
        <ul className="divide-y rounded-lg border border-neutral-200 bg-white">
          {props.candidates.map((candidate) => (
            <li key={`${candidate.lat},${candidate.lng},${candidate.label}`}>
              <button
                type="button"
                onClick={() => props.onSelect(candidate)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-100"
              >
                {candidate.label}
                <span className="block text-xs text-neutral-400">
                  {candidate.lat.toFixed(5)}, {candidate.lng.toFixed(5)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {props.unavailable ? (
        <p className="text-xs text-amber-700">
          Address search is unavailable right now. Enter the address and coordinates manually
          below, or continue and we will try to geocode it when quoting.
        </p>
      ) : null}
      <button
        type="button"
        onClick={props.onToggleManual}
        className="text-xs font-medium text-neutral-500 underline underline-offset-4"
      >
        {props.showManual ? 'Hide manual coordinates' : 'Enter coordinates manually'}
      </button>
      {props.showManual ? (
        <CoordinateFields
          latValue={props.manualLat}
          lngValue={props.manualLng}
          onLatChange={props.onManualLatChange}
          onLngChange={props.onManualLngChange}
        />
      ) : null}
      {props.error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {props.error}
        </p>
      ) : null}
    </div>
  );
}

export function LocationsForm({ onBack, onContinue }: LocationsFormProps) {
  const [pickupQuery, setPickupQuery] = useState('');
  const [dropoffQuery, setDropoffQuery] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [manual, setManual] = useState({ pickup: false, dropoff: false });
  const [manualPickupLat, setManualPickupLat] = useState('');
  const [manualPickupLng, setManualPickupLng] = useState('');
  const [manualDropoffLat, setManualDropoffLat] = useState('');
  const [manualDropoffLng, setManualDropoffLng] = useState('');

  const pickup = useAddressSearch(pickupQuery);
  const dropoff = useAddressSearch(dropoffQuery);

  function validatePoint(
    query: string,
    showManual: boolean,
    manualLat: string,
    manualLng: string,
  ): ResolvedPoint | string {
    const address = query.trim();
    if (address === '') {
      return 'Enter an address.';
    }
    if (address.length > 300) {
      return 'Address is too long (maximum 300 characters).';
    }
    if (showManual && (manualLat.trim() !== '' || manualLng.trim() !== '')) {
      // Manual coordinates must both parse; ranges match the shared schemas.
      const lat = Number.parseFloat(manualLat);
      const lng = Number.parseFloat(manualLng);
      if (Number.isNaN(lat) || lat < -90 || lat > 90) {
        return 'Latitude must be a number between -90 and 90.';
      }
      if (Number.isNaN(lng) || lng < -180 || lng > 180) {
        return 'Longitude must be a number between -180 and 180.';
      }
      return { address, lat, lng };
    }
    // No manual coordinates: the typed address goes to the server geocoder.
    return { address, lat: null, lng: null };
  }

  function handleContinue() {
    const pickupResult = validatePoint(pickupQuery, manual.pickup, manualPickupLat, manualPickupLng);
    const dropoffResult = validatePoint(
      dropoffQuery,
      manual.dropoff,
      manualDropoffLat,
      manualDropoffLng,
    );

    const nextErrors: FieldErrors = {};
    if (typeof pickupResult === 'string') nextErrors.pickup = pickupResult;
    if (typeof dropoffResult === 'string') nextErrors.dropoff = dropoffResult;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    onContinue({
      pickup: pickupResult as ResolvedPoint,
      dropoff: dropoffResult as ResolvedPoint,
    });
  }

  return (
    <div className="space-y-6">
      <LocationField
        label="Pickup location"
        hint="Where the rider should collect the parcel."
        value={pickupQuery}
        error={errors.pickup}
        onChange={setPickupQuery}
        candidates={pickup.candidates}
        searching={pickup.searching}
        unavailable={pickup.unavailable}
        onSelect={(candidate) => {
          setPickupQuery(candidate.label);
          setManualPickupLat(String(candidate.lat));
          setManualPickupLng(String(candidate.lng));
          pickup.onSelection();
        }}
        showManual={manual.pickup}
        onToggleManual={() => setManual((m) => ({ ...m, pickup: !m.pickup }))}
        manualLat={manualPickupLat}
        manualLng={manualPickupLng}
        onManualLatChange={setManualPickupLat}
        onManualLngChange={setManualPickupLng}
      />
      <LocationField
        label="Destination"
        hint="Where the parcel should be delivered."
        value={dropoffQuery}
        error={errors.dropoff}
        onChange={setDropoffQuery}
        candidates={dropoff.candidates}
        searching={dropoff.searching}
        unavailable={dropoff.unavailable}
        onSelect={(candidate) => {
          setDropoffQuery(candidate.label);
          setManualDropoffLat(String(candidate.lat));
          setManualDropoffLng(String(candidate.lng));
          dropoff.onSelection();
        }}
        showManual={manual.dropoff}
        onToggleManual={() => setManual((m) => ({ ...m, dropoff: !m.dropoff }))}
        manualLat={manualDropoffLat}
        manualLng={manualDropoffLng}
        onManualLatChange={setManualDropoffLat}
        onManualLngChange={setManualDropoffLng}
      />
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium hover:bg-neutral-100"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleContinue}
          className="flex-1 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Continue to parcels
        </button>
      </div>
    </div>
  );
}
