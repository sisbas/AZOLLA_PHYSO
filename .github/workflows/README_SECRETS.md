# Hugging Face Deployment Secrets

Bu workflow'u kullanabilmek için GitHub repository'nizin **Settings > Secrets and variables > Actions** bölümünde aşağıdaki secret'ları tanımlamanız gerekir:

## 1. HF_TOKEN
Hugging Face access token'ınız.

### Nasıl Alınır:
1. https://huggingface.co/settings/tokens adresine gidin
2. "New token" butonuna tıklayın
3. Token tipi olarak **Write** seçin (Spaces'e deploy edebilmek için gerekli)
4. Token'a bir isim verin (örn: `github-actions-deploy`)
5. Token'ı oluşturun ve kopyalayın
6. GitHub repo'nuzda **Settings > Secrets and variables > Actions > New repository secret** bölümüne gidin
7. Name: `HF_TOKEN`, Value: [kopyaladığınız token] olarak ekleyin

## 2. HF_SPACE_ID
Hugging Face Spaces ID'niz.

### Format:
```
username/space-name
```
veya
```
organization-name/space-name
```

### Nasıl Bulunur:
1. Hugging Face'de Space'inizi oluşturun (https://huggingface.co/spaces/new)
2. Space URL'niz şu şekilde olacak: `https://huggingface.co/spaces/username/space-name`
3. Space ID, URL'deki `username/space-name` kısmıdır
4. GitHub repo'nuzda **Settings > Secrets and variables > Actions > New repository secret** bölümüne gidin
5. Name: `HF_SPACE_ID`, Value: `username/space-name` olarak ekleyin

## Workflow Nasıl Çalışır?

1. **main** veya **master** branch'ine her push yapıldığında otomatik olarak tetiklenir
2. Manuel olarak da **Actions** sekmesinden "Run workflow" butonu ile tetiklenebilir
3. Workflow şunları yapar:
   - Repository'yi checkout eder
   - Node.js kurar ve frontend'i build eder (`npm run build`)
   - Python kurar ve bağımlılıkları yükler
   - Hugging Face Space'inizi git ile clone eder
   - Tüm dosyaları Space'e kopyalar (`.git`, `hf_space` ve `.github` klasörleri hariç)
   - Değişiklikleri commit edip Hugging Face'e push eder
   - Hugging Face otomatik olarak Docker container'ı build eder ve uygulamayı başlatır

## Önemli Notlar

- Space'inizin SDK tipi **Docker** olarak ayarlanmış olmalıdır
- İlk deploy'dan sonra Space otomatik olarak build edilecektir (~5-10 dakika sürebilir)
- Build başarısız olursa, GitHub Actions log'larını kontrol edin
- Space'iniz public ise, token'ınızın da public repo'lara erişimi olduğundan emin olun
