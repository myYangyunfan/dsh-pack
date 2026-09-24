/**
 * Client-side feature registry: the extension seam for future visualizations.
 * A feature contributes an id, a tab label, and a React component. Adding a
 * visualization means adding one entry here plus the component — the panel
 * chrome (tab bar, settings section) is untouched.
 */
import type { ComponentType } from 'react';
import type { Context } from '../context-types.ts';
/** One panel feature (a tab). */
export interface PanelFeature {
    id: string;
    label: () => string;
    Component: ComponentType<{
        ctx: Context;
    }>;
}
/** The ordered feature list. */
export declare const FEATURES: PanelFeature[];
