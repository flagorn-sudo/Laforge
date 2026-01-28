import { create } from 'zustand';
import { Project, ProjectHealth } from '../types';
import { projectService } from '../services/projectService';
import { sftpService } from '../services/sftpService';
import { ProjectFormData } from '../components/ProjectForm';
import { useSettingsStore } from './settingsStore';

interface ProjectState {
  projects: Project[];
  projectErrors: ProjectHealth[];  // Projets avec problèmes de chemin
  selectedProjectId: string | null;
  loading: boolean;
  error: string | null;

  // Editing protection flags
  isEditing: boolean;
  editingProjectId: string | null;

  // Actions
  setProjects: (projects: Project[]) => void;
  setProjectErrors: (errors: ProjectHealth[]) => void;
  selectProject: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Editing protection actions
  startEditing: (projectId: string) => void;
  stopEditing: () => void;

  // Async actions
  fetchProjects: () => Promise<void>;
  createProject: (
    data: ProjectFormData,
    workspacePath: string,
    folderStructure?: string[]
  ) => Promise<Project>;
  importProject: (
    folderPath: string,
    data: ProjectFormData,
    createMissingFolders: boolean
  ) => Promise<Project>;
  updateProject: (
    project: Project,
    password?: string,
    savePassword?: boolean
  ) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;

  // Local update (optimistic - no disk I/O)
  updateProjectLocally: (project: Project) => void;

  // Computed
  getSelectedProject: () => Project | undefined;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  projectErrors: [],
  selectedProjectId: null,
  loading: false,
  error: null,

  // Editing protection flags
  isEditing: false,
  editingProjectId: null,

  setProjects: (projects) => set({ projects }),
  setProjectErrors: (errors) => set({ projectErrors: errors }),
  selectProject: (id) => set({ selectedProjectId: id }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  // Editing protection actions
  startEditing: (projectId: string) => set({ isEditing: true, editingProjectId: projectId }),
  stopEditing: () => set({ isEditing: false, editingProjectId: null }),

  fetchProjects: async () => {
    // Get registered projects from settings store
    const registeredPaths = useSettingsStore.getState().registeredProjects || [];

    // If no registered projects, don't show loading
    if (registeredPaths.length === 0) {
      console.log('[ProjectStore] No registered projects');
      set({ projects: [], projectErrors: [], loading: false });
      return;
    }

    const { isEditing, editingProjectId, projects: currentProjects } = get();

    // If editing is in progress, use merge strategy instead of blocking
    if (isEditing && editingProjectId) {
      console.log('[ProjectStore] Fetch during editing - will merge');
      const editingProject = currentProjects.find(p => p.id === editingProjectId);

      set({ loading: true, error: null });
      try {
        const { projects: fetchedProjects, errors } = await projectService.loadRegisteredProjects(registeredPaths);

        // Merge: keep the project being edited from local state
        const merged = fetchedProjects.map(p =>
          p.id === editingProjectId && editingProject ? editingProject : p
        );

        // Verify FTP credentials for configured projects
        const configuredProjects = merged.filter(p => p.sftp.configured);
        if (configuredProjects.length > 0) {
          const credentialsMap = await sftpService.verifyCredentials(
            configuredProjects.map(p => p.id)
          );
          merged.forEach(p => {
            if (p.sftp.configured) {
              p.sftp.passwordAvailable = credentialsMap.get(p.id) ?? false;
            }
          });
        }

        set({ projects: merged, projectErrors: errors, loading: false });
      } catch (err) {
        console.error('[ProjectStore] Error fetching projects during editing:', err);
        set({ loading: false });
      }
      return;
    }

    set({ loading: true, error: null });

    try {
      console.log('[ProjectStore] Loading', registeredPaths.length, 'registered projects');
      const { projects, errors } = await projectService.loadRegisteredProjects(registeredPaths);
      console.log('[ProjectStore] Loaded', projects.length, 'projects,', errors.length, 'errors');

      // Verify FTP credentials for all configured projects
      const configuredProjects = projects.filter(p => p.sftp.configured);
      console.log('[ProjectStore] Configured FTP projects:', configuredProjects.length);

      if (configuredProjects.length > 0) {
        console.log('[ProjectStore] Verifying credentials for:', configuredProjects.map(p => p.id));
        const credentialsMap = await sftpService.verifyCredentials(
          configuredProjects.map(p => p.id)
        );
        console.log('[ProjectStore] Credentials verification results:', Object.fromEntries(credentialsMap));

        // Update projects with password availability status
        projects.forEach(p => {
          if (p.sftp.configured) {
            const hasPassword = credentialsMap.get(p.id) ?? false;
            console.log('[ProjectStore] Project', p.name, 'passwordAvailable:', hasPassword);
            p.sftp.passwordAvailable = hasPassword;
          }
        });
      }

      set({ projects, projectErrors: errors, loading: false });
    } catch (err) {
      console.error('[ProjectStore] Error fetching projects:', err);
      set({
        error: err instanceof Error ? err.message : 'Erreur de chargement',
        projects: [],
        projectErrors: [],
        loading: false,
      });
    }
  },

  createProject: async (data, workspacePath, folderStructure) => {
    if (!workspacePath) {
      throw new Error('Aucun dossier de travail configuré');
    }

    const project = await projectService.createProjectWithData(
      data,
      workspacePath,
      folderStructure
    );

    // Register the project path in settings
    useSettingsStore.getState().registerProject(project.path);

    // Add project to local state immediately (don't wait for refresh)
    set((state) => ({
      projects: [...state.projects, project].sort((a, b) => a.name.localeCompare(b.name)),
    }));

    // Save password to keychain if requested (don't fail if this fails)
    if (data.savePassword && data.sftp.password && data.sftp.host) {
      try {
        await sftpService.saveCredentials(project.id, data.sftp.password);
      } catch (e) {
        console.warn('Could not save password to keychain:', e);
      }
    }

    return project;
  },

  importProject: async (folderPath, data, createMissingFolders) => {
    const { projects } = get();

    const project = await projectService.importProject(
      folderPath,
      data,
      createMissingFolders,
      projects
    );

    // Register the project path in settings
    useSettingsStore.getState().registerProject(project.path);

    // Add project to local state immediately
    set((state) => ({
      projects: [...state.projects, project].sort((a, b) => a.name.localeCompare(b.name)),
    }));

    // Save password to keychain if requested
    if (data.savePassword && data.sftp.password && data.sftp.host) {
      try {
        await sftpService.saveCredentials(project.id, data.sftp.password);
      } catch (e) {
        console.warn('Could not save password to keychain:', e);
      }
    }

    return project;
  },

  updateProject: async (project, password, savePassword) => {
    await projectService.saveProject(project);

    // Save password to keychain if requested
    if (savePassword && password) {
      await sftpService.saveCredentials(project.id, password);
    }

    // Update in local state
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === project.id ? project : p
      ),
    }));
  },

  deleteProject: async (projectId) => {
    await projectService.deleteProject(projectId);

    // Unregister the project path from settings
    useSettingsStore.getState().unregisterProject(projectId);

    set((state) => ({
      projects: state.projects.filter((p) => p.id !== projectId),
      selectedProjectId:
        state.selectedProjectId === projectId ? null : state.selectedProjectId,
    }));
  },

  updateProjectLocally: (project: Project) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === project.id ? { ...p, ...project } : p
      ),
    }));
  },

  getSelectedProject: () => {
    const { projects, selectedProjectId } = get();
    return projects.find((p) => p.id === selectedProjectId);
  },
}));
