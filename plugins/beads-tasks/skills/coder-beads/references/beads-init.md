# Initialize and Set Up Beads

Use this when beads needs to be set up for a project.

## Setup

1. Check whether `bd` is installed.
2. If `bd` is missing, ask the user how they want to install beads before proceeding. A common option is:

   ```bash
   npm install -g beads
   ```

   Continue only after `bd` is available.
3. Check whether beads is already initialized in the project.
4. If beads is already initialized, inspect the current state before changing anything:
   - confirm whether the setup is healthy
   - confirm whether the current beads mode matches the project mode
5. If beads is not initialized, initialize it for the project:
   - stealth mode:

     ```bash
     bd init --stealth --skip-agents
     ```

   - team mode:

     ```bash
     bd init --skip-agents
     ```

6. If beads is initialized but its current mode does not match the project mode, ask the user whether beads should be switched.
7. Run:

   ```bash
   bd doctor
   ```

8. If `bd doctor` reports issues, fix them using:
   - [beads-setup-troubleshooting.md](beads-setup-troubleshooting.md)
   - [beads-runtime-troubleshooting.md](beads-runtime-troubleshooting.md)

9. Verify the final state:

   ```bash
   bd status
   ```

Only do the missing or corrective setup steps needed for the current project state.
