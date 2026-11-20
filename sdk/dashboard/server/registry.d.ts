export interface ProjectEntry {
    id: string;
    name: string;
    path: string;
}
export declare class ProjectRegistry {
    private readonly filePath;
    constructor(filePath: string);
    list(): Promise<ProjectEntry[]>;
    get(id: string): Promise<ProjectEntry | undefined>;
    add(projectPath: string): Promise<ProjectEntry>;
    remove(id: string): Promise<void>;
    private load;
    private save;
}
//# sourceMappingURL=registry.d.ts.map