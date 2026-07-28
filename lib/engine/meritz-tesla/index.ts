import { makeVehicleFinder, quoteMeritzEvLease, type MeritzEvLeaseInput, type MeritzEvLeaseQuote } from "../meritz-ev/lease";
import vehiclesJson from "./data/vehicles.json";

export const findTeslaVehicle = makeVehicleFinder(vehiclesJson as Record<string, unknown>);

export function quoteMeritzTeslaLease(input: MeritzEvLeaseInput): MeritzEvLeaseQuote {
  return quoteMeritzEvLease(findTeslaVehicle, input);
}
