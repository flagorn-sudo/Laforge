import { useState, useEffect, useCallback } from 'react';
import { Project } from '../types';
import { projectService } from '../services/projectService';
import { sftpService } from '../services/sftpService';
import { ProjectFormData } from '../components/ProjectForm';

export function useProjects(workspacePath: string, folderStructure?: string[]) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!workspacePath) {
      setProjects([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const scanned = await projectService.scanProjects(workspacePath);
      setProjects(scanned);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [workspacePath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createProject = useCallback(
    async (data: ProjectFormData) => {
      if (!workspacePath) {
        throw new Error('Aucun dossier de travail configuré');
      }
      const project = await projectService.createProjectWithData(
        data,
        workspacePath,
        folderStructure
      );

      // Save password to keychain if requested
      if (data.savePassword && data.sftp.password && data.sftp.host) {
        await sftpService.saveCredentials(project.id, data.sftp.password);
      }

      await refresh();
      return project;
    },
    [workspacePath, folderStructure, refresh]
  );

  const updateProject = useCallback(
    async (project: Project, password?: string, savePassword?: boolean) => {
      await projectService.saveProject(project);

      // Save password to keychain if requested
      if (savePassword && password) {
        await sftpService.saveCredentials(project.id, password);
      }

      await refresh();
    },
    [refresh]
  );

  return {
    projects,
    loading,
    error,
    refresh,
    createProject,
    updateProject,
  };
}
