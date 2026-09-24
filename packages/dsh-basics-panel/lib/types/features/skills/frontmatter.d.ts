/** The public skill-name grammar (mirror of dsh-skill's SKILL_NAME). */
export declare const SKILL_NAME_RE: RegExp;
/** Whether a string is a valid kebab-case skill name. */
export declare function isSkillName(name: string): boolean;
/** The split form of a skill file: frontmatter text (without the delimiters) and body. */
export interface SkillFileParts {
    frontmatter: string;
    body: string;
}
/**
 * Split a raw skill file into its frontmatter text and body. Returns
 * undefined when the file has no `---`-delimited frontmatter block.
 */
export declare function splitSkillFile(raw: string): SkillFileParts | undefined;
/** Parse frontmatter text to a plain object, or undefined when it is not a mapping. */
export declare function parseFrontmatter(frontmatter: string): Record<string, unknown> | undefined;
/** The fields the editor may change. */
export interface SkillEdit {
    description?: string;
    whenToUse?: string | null;
    metadata?: Record<string, unknown> | null;
    modelInvocable?: boolean;
    userInvocable?: boolean;
    body?: string;
}
/**
 * Validate an edit's frontmatter fields, returning the normalized patch to
 * apply to the YAML node. Throws a TypeError with a Chinese message on an
 * invalid field.
 */
export declare function normalizeSkillPatch(edit: SkillEdit): Record<string, unknown>;
/**
 * Apply a skill edit to a raw skill file. The edit is validated, the
 * frontmatter is patched in place (round-tripped through the yaml Document so
 * unknown keys and comments survive), and the body is replaced when supplied.
 * Returns the full edited file text.
 */
export declare function applySkillEdit(raw: string, edit: SkillEdit): string;
