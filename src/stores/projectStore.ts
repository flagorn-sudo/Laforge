import { create } from 'zustand';
import { Project } from '../types';
import { projectService } from '../services/projectService';
import { sftpService } from '../services/sftpService';
import { ProjectFormData } from '../components/ProjectForm';

interface ProjectState {
  projects: Project[];
  selectedProjectId: string | null;
  loading: boolean;
  error: string | null;

  // Actions
  setProjects: (projects: Project[]) => void;
  selectProject: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Async actions
  fetchProjects: (workspacePath: string) => Promise<void>;
  createProject: (
    data: ProjectFormData,
    workspacePath: string,
    folderStructure?: string[]
  ) => Promise<Project>;
  updateProject: (
    project: Project,
    password?: string,
    savePassword?: boolean
  ) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;

  // Computed
  getSelectedProject: () => Project | undefined;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  selectedProjectId: null,
  loading: false,
  error: null,

  setProjects: (projects) => set({ projects }),
  selectProject: (id) => set({ selectedProjectId: id }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  fetchProjects: async (workspacePath: string) => {
    if (!workspacePath) {
      set({ projects: [], loading: false });
      return;
    }

    set({ loading: true, error: null });

    try {
      console.log('[ProjectStore] Scanning projects from:', workspacePath);
      const projects = await projectService.scanProjects(workspacePath);
      console.log('[ProjectStore] Found', projects.length, 'projects');

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

      set({ projects, loading: false });
    } catch (err) {
      console.error('[ProjectStore] Error fetching projects:', err);
      set({
        error: err instanceof Error ? err.message : 'Erreur de chargement',
        projects: [],
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
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== projectId),
      selectedProjectId:
        state.selectedProjectId === projectId ? null : state.selectedProjectId,
    }));
  },

  getSelectedProject: () => {
    const { projects, selectedProjectId } = get();
    return projects.find((p) => p.id === selectedProjectId);
  },
}));
