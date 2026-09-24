/** The custom switch. */
export declare function Toggle(props: {
    checked: boolean;
    onChange: (next: boolean) => void;
    label: string;
    disabled?: boolean;
}): import("react").JSX.Element;
/** A colored status dot. */
export declare function StatusDot(props: {
    kind: 'connected' | 'enabled' | 'disabled';
}): import("react").JSX.Element;
