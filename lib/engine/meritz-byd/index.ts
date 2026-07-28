import { makeVehicleFinder, quoteMeritzEvLease, type MeritzEvLeaseInput, type MeritzEvLeaseQuote } from "../meritz-ev/lease";
import vehiclesJson from "./data/vehicles.json";

export const findBydVehicle = makeVehicleFinder(vehiclesJson as Record<string, unknown>);

export function quoteMeritzBydLease(input: MeritzEvLeaseInput): MeritzEvLeaseQuote {
  return quoteMeritzEvLease(findBydVehicle, input);
}
