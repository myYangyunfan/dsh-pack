import type { Context } from '../context-types.ts';
export interface PanelSectionProps {
    close: () => void;
    ctx: Context;
}
export declare function PanelSection(props: PanelSectionProps): import("react").JSX.Element;
