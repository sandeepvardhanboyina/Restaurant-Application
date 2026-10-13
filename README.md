# Deploy the Restaurant Application

Requirements: PowerShell, Python 3.12+, kubectl already set to your GKE cluster, a default StorageClass, and at least `170m` CPU / `416Mi` memory available for Pod requests.

Uses the published Docker Hub images referenced in `k8s/`. Keep your existing `.env` when redeploying. Do not commit `.env` or `k8s/secret.yaml`.

## 1. Open the project

```powershell
Set-Location (Read-Host 'Full path to Restaurant Application')
kubectl get nodes
kubectl get storageclass
```

## 2. Generate credentials

```powershell
python readme-files/prepare.py
```

## 3. Create namespace and configuration

```powershell
kubectl create namespace restaurant --dry-run=client -o yaml |
    kubectl apply -f -

kubectl -n restaurant apply -f k8s/configmap.yaml
kubectl -n restaurant apply -f k8s/secret.yaml
```

## 4. Deploy MySQL, backend, and frontend

Run each command only after the previous command succeeds.

```powershell
kubectl -n restaurant apply -f k8s/mysql.yaml
kubectl -n restaurant rollout status statefulset/mysql --timeout=300s

kubectl -n restaurant apply -f k8s/backend.yaml
kubectl -n restaurant rollout status deployment/backend --timeout=300s

kubectl -n restaurant apply -f k8s/frontend.yaml
kubectl -n restaurant rollout status deployment/frontend --timeout=300s
```

## 5. Open the public application

```powershell
kubectl -n restaurant wait --for=jsonpath='{.status.loadBalancer.ingress}' service/frontend --timeout=300s
$AppIP = kubectl -n restaurant get service frontend -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
if (-not $AppIP) { throw 'No external IP assigned. Check the frontend Service.' }
$AppUrl = "http://$AppIP"
Invoke-RestMethod "$AppUrl/api/health/ready"
Start-Process $AppUrl
```

| Access | Address / credentials |
| --- | --- |
| Application | `http://<EXTERNAL-IP>` |
| API documentation | `http://<EXTERNAL-IP>/api/docs` |
| Admin | Click **Admin**; username `admin`; password is `ADMIN_PASSWORD` in `.env` |
| MySQL (cluster internal) | `mysql.restaurant.svc.cluster.local:3306`; database/user `restaurant`; password is `MYSQL_PASSWORD` in `.env` |

## 6. Verify

```powershell
kubectl -n restaurant get pods,services,pvc
python backend/smoke_test.py $AppUrl
```

Expected: three Pods `1/1 Running`, PVC `Bound`, and integration checks passed. The check creates a test order.

If deployment fails:

```powershell
kubectl -n restaurant get events --sort-by=.metadata.creationTimestamp
kubectl -n restaurant logs mysql-0 --tail=50
kubectl -n restaurant logs deployment/backend --tail=50
kubectl -n restaurant logs deployment/frontend --tail=50
```
