import {
    DefaultDirectoryManager,
    GitCommandGitProject,
} from "../../project/git/GitCommandGitProject";
import { GitProject } from "../../project/git/GitProject";
import {
    DefaultCloneOptions,
    DirectoryManager,
} from "../../spi/clone/DirectoryManager";
import { GitlabRepoRef } from "./GitlabRepoRef";
import { ProjectOperationCredentials } from "./ProjectOperationCredentials";
import { isRemoteRepoRef } from "./RepoId";
import { RepoLoader } from "./repoLoader";

/**
 * Materialize from gitlab
 * @param credentials provider token
 * @param directoryManager strategy for handling local storage
 * @return function to materialize repos
 */
export function gitlabRepoLoader(credentials: ProjectOperationCredentials,
                                 directoryManager: DirectoryManager = DefaultDirectoryManager): RepoLoader<GitProject> {
    return repoId => {
        // Default it if it isn't already a Gitlab repo ref
        const gid = isRemoteRepoRef(repoId) ? repoId : GitlabRepoRef.from({
            owner: repoId.owner,
            repo: repoId.repo,
            sha: repoId.sha,
            branch: repoId.branch,
        });
        return GitCommandGitProject.cloned(credentials, gid, DefaultCloneOptions, directoryManager);
    };
}
