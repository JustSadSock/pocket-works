import { RawIntegrationParameters } from "../raw";
export class IntegrationParameters {
    constructor(raw) {
        this.raw = raw || new RawIntegrationParameters();
    }
    /**
     * Free the WASM memory used by these integration parameters.
     */
    free() {
        if (!!this.raw) {
            this.raw.free();
        }
        this.raw = undefined;
    }
    /**
     * The timestep length (default: `1.0 / 60.0`)
     */
    get dt() {
        return this.raw.dt;
    }
    /**
     * The Error Reduction Parameter in `[0, 1]` is the proportion of
     * the positional error to be corrected at each time step (default: `0.2`).
     */
    get erp() {
        return this.raw.erp;
    }
    /**
     * Amount of penetration the engine wont attempt to correct (default: `0.001m`).
     */
    get allowedLinearError() {
        return this.raw.allowedLinearError;
    }
    /**
     * The maximal distance separating two objects that will generate predictive contacts (default: `0.002`).
     */
    get predictionDistance() {
        return this.raw.predictionDistance;
    }
    /**
     * The number of solver iterations run by the constraints solver for calculating forces (default: `4`).
     */
    get numSolverIterations() {
        return this.raw.numSolverIterations;
    }
    /**
     * Number of addition friction resolution iteration run during the last solver sub-step (default: `4`).
     */
    get numAdditionalFrictionIterations() {
        return this.raw.numAdditionalFrictionIterations;
    }
    /**
     * Number of internal Project Gauss Seidel (PGS) iterations run at each solver iteration (default: `1`).
     */
    get numInternalPgsIterations() {
        return this.raw.numInternalPgsIterations;
    }
    /**
     * Minimum number of dynamic bodies in each active island (default: `128`).
     */
    get minIslandSize() {
        return this.raw.minIslandSize;
    }
    /**
     * Maximum number of substeps performed by the  solver (default: `1`).
     */
    get maxCcdSubsteps() {
        return this.raw.maxCcdSubsteps;
    }
    set dt(value) {
        this.raw.dt = value;
    }
    set erp(value) {
        this.raw.erp = value;
    }
    set allowedLinearError(value) {
        this.raw.allowedLinearError = value;
    }
    set predictionDistance(value) {
        this.raw.predictionDistance = value;
    }
    /**
     * Sets the number of solver iterations run by the constraints solver for calculating forces (default: `4`).
     */
    set numSolverIterations(value) {
        this.raw.numSolverIterations = value;
    }
    /**
     * Sets the number of addition friction resolution iteration run during the last solver sub-step (default: `4`).
     */
    set numAdditionalFrictionIterations(value) {
        this.raw.numAdditionalFrictionIterations = value;
    }
    /**
     * Sets the number of internal Project Gauss Seidel (PGS) iterations run at each solver iteration (default: `1`).
     */
    set numInternalPgsIterations(value) {
        this.raw.numInternalPgsIterations = value;
    }
    set minIslandSize(value) {
        this.raw.minIslandSize = value;
    }
    set maxCcdSubsteps(value) {
        this.raw.maxCcdSubsteps = value;
    }
    switchToStandardPgsSolver() {
        this.raw.switchToStandardPgsSolver();
    }
    switchToSmallStepsPgsSolver() {
        this.raw.switchToSmallStepsPgsSolver();
    }
}
//# sourceMappingURL=integration_parameters.js.map