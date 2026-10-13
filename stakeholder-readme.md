# Restaurant Application: Stakeholder Overview

Customers can browse the menu, place orders, and track their progress online. Restaurant staff can securely sign in to manage the menu and update orders.

## Automatic recovery

The system checks whether the application is working and automatically attempts to restart parts that stop responding. This is called **self-healing** and reduces the need for manual intervention.

Order and menu information is stored separately from the running application so it remains available after an application restart. Customers may experience a brief interruption during recovery.

## Application updates

The current setup may briefly interrupt access when a new version is released.

An improvement under consideration is **blue-green deployment**: prepare and check the new version while customers continue using the existing version, then move customers to the new version when it is ready.

The goal is to release updates without interrupting customers. This approach is not yet in place, so uninterrupted service cannot currently be promised.

## Protecting sensitive information

- Passwords and access keys are managed separately from the application code using a feature called **Kubernetes Secrets**.
- The files containing real credentials are excluded from normal code sharing and are not currently included in the project's tracked files.
- Shared example files contain no real passwords.

**Our policy is to never upload real passwords or access keys to GitHub, where the application code is shared.** The project has safeguards to help prevent accidental uploads; past uploads have not been independently audited.
