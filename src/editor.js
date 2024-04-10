const style = `<style>
body {
    font-family: "Chinese Quotes", "Inter var", "Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Helvetica, Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
    margin: 0;
}

input,
button,
select,
textarea {
    outline: none;
    border: none;
    background: rgba(142, 150, 170, .14);
    padding: 8px 10px;
    border-radius: 8px;
    font-family: inherit;
    font-size: initial;
    display: flex;
    align-items: center;
    justify-content: center;
}

input:hover,
button:hover,
select:hover {
    background: rgba(142, 150, 170, .24);
}

textarea {
    width: 100%;
    height: 100%;
    background: none;
    resize: vertical;
    overflow-y: hidden;
}

.container {
    max-width: 50rem;
    margin: 0 auto;
    padding: 20px;
}

header {
    background: #f6f6f7;
}

header h1 {
    color: #3451b2;
    font-weight: 700;
    margin: 0;
    margin-bottom: 18px;
}

header h1 a {
    color: inherit;
    text-decoration: none;
}

.tools {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 10px;
}

.tools select {
    flex: 1;
    max-width: calc(100% - 44px);
}

.tools input[type="text"] {
    flex: 1;
}

@media (max-width: 400px) {
    .tools button {
        flex: 1;
    }       
}
</style>`
const script = `<script>
        const title = document.getElementById('title')
        const content = document.getElementById('content')
        const createon = document.getElementById('date')
        const select = document.getElementById('select')
        const delBtn = document.getElementById('delBtn')
        let isNewPostMode = false
        let isComposing = false

        const GetId = () => select.options[select.selectedIndex].value
        const SetVal = (...v) => {
            title.value = v[0]
            content.value = v[1]
            createon.value = v[2]
            title.disabled = v[3]
            delBtn.disabled = v[3]
        }
        const Toasts = (flag, prefix) => {
            if (flag) {
                alert(\`\${prefix}成功\`)
                return window.location.reload()
            }
            alert(\`\${prefix}失败\`)
        }
        const AutoResize = () => {
            content.style.height = 'auto';
            content.style.height = content.scrollHeight + 'px';
        }

        async function UploadFile() {
            const formatDate = date => {
                const year = date.getFullYear()
                const month = (date.getMonth() + 1).toString().padStart(2, '0')
                const day = date.getDate().toString().padStart(2, '0')
                return \`\${year}-\${month}-\${day}\`
            }

            const fileInput = document.createElement('input')
            fileInput.type = 'file'
            fileInput.style.display = 'none'

            fileInput.addEventListener('change', async e => {
                const file = e.target.files[0]
                const fileName = file.name
                const lastModifiedDate = file.lastModified
                const fileDate = new Date(lastModifiedDate)
                
                if (!file) return;

                await NewPost()
                const reader = new FileReader()
                reader.onload = e => {
                    const fileContent = e.target.result
                    SetVal(fileName.slice(0, fileName.lastIndexOf('.')), fileContent, formatDate(fileDate), false)
                    AutoResize()
                }
                reader.readAsText(file)
            })

            fileInput.click()
            fileInput.remove();
        }

        async function NewPost() {
            SetVal('', '', '', false)
            isNewPostMode = true
        }

        async function SelectPost() {
            const res = await fetch(\`/post-\${GetId()}?raw\`, {
                headers: { 'Content-Type': 'application/json' }
            })
            const data = await res.json()
            SetVal(data.title, data.content, data.createon, data.id == 1 ? true : false)
            AutoResize()
            isNewPostMode = false
        }

        async function DeletePost() {
            let code = ''
            do {
                code = prompt('如果确定删除，请输入验证码')
            } while (code == '')

            if (code == null) return;

            const res = await fetch(\`/post-\${GetId()}\`, {
                method: 'DELETE',
                headers: { 'Code': code }
            })
            const json = await res.json()
            Toasts(json.success, '删除')
        }

        async function Save() {
            if (!(title.value && createon.value && content.value))
                return alert('标题、内容、日期不得为空')

            let code = ''
            do {
                code = prompt('请输入验证码')
            } while (code == '')

            if (code == null) return;

            let [ uri, method ] = [ \`/post-\${GetId()}\`, 'PATCH' ]
            let prefix = '保存'

            if (isNewPostMode) {
                [ uri, method ] = [ '/post', 'POST' ]
                prefix = '新增'
            }

            const res = await fetch(uri, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Code': code
                },
                body: JSON.stringify({
                    title: title.value,
                    content: content.value,
                    createon: createon.value
                })
            })
            const json = await res.json()
            Toasts(json.success, prefix)
        }

        window.onload = SelectPost()
        content.addEventListener('input', AutoResize)
        content.addEventListener('compositionstart', () => isComposing = true)
        content.addEventListener('compositionend', () => {
            isComposing = false
            AutoResize.call()
            content.blur()
            content.focus()
        })
    </script>`
const html = postList => {
    let htmlStr = ''
    postList.forEach(({id, title}) => {
        htmlStr += `<option value="${id}">${title}</option>`
    })

    return `<header>
        <div class="container">
            <h1><a href="/">编辑器</a></h1>
            <div class="tools">
                <button title="上传文件" onclick="UploadFile()"><?xml version="1.0" encoding="UTF-8"?><svg width="18" height="18" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><mask id="icon-938cfee7f10b972" maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48" style="mask-type: alpha"><path d="M48 0H0V48H48V0Z" fill="#FFF"/></mask><g mask="url(#icon-938cfee7f10b972)"><path d="M6 24.0083V42H42V24" stroke="#333" stroke-width="4" stroke-linecap="square" stroke-linejoin="round"/><path d="M33 15L24 6L15 15" stroke="#333" stroke-width="4" stroke-linecap="square" stroke-linejoin="round"/><path d="M23.9917 32V6" stroke="#333" stroke-width="4" stroke-linecap="square" stroke-linejoin="round"/></g></svg></button>
                <button title="新增内容" onclick="NewPost()"><?xml version="1.0" encoding="UTF-8"?><svg width="18" height="18" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24.0605 10L24.0239 38" stroke="#333" stroke-width="4" stroke-linecap="square" stroke-linejoin="round"/><path d="M10 24L38 24" stroke="#333" stroke-width="4" stroke-linecap="square" stroke-linejoin="round"/></svg></button>
                <select title="所有文章" id="select" onchange="SelectPost()">
                    ${htmlStr}
                </select>
                <button title="删除文章" id="delBtn" onclick="DeletePost()"><?xml version="1.0" encoding="UTF-8"?><svg width="18" height="18" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 11L40 11" stroke="#333" stroke-width="4" stroke-linecap="square" stroke-linejoin="round"/><path d="M18 5L30 5" stroke="#333" stroke-width="4" stroke-linecap="square" stroke-linejoin="round"/><path d="M12 17H36V40C36 41.6569 34.6569 43 33 43H15C13.3431 43 12 41.6569 12 40V17Z" fill="#333" stroke="#333" stroke-width="4" stroke-linejoin="round"/><path d="M20 25L28 33" stroke="#FFF" stroke-width="4" stroke-linecap="square" stroke-linejoin="round"/><path d="M28 25L20 33" stroke="#FFF" stroke-width="4" stroke-linecap="square" stroke-linejoin="round"/></svg></button>
            </div>
            <div class="tools">
                <input type="text" id="title" placeholder="标题">
                <input type="date" id="date">
                <button title="保存更改" onclick="Save()"><?xml version="1.0" encoding="UTF-8"?><svg width="18" height="18" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M43 11L16.875 37L5 25.1818" stroke="#333" stroke-width="4" stroke-linecap="square" stroke-linejoin="round"/></svg></button>
            </div>
        </div>
    </header>
    <main>
        <div class="container">
        <textarea id="content" wrap="off"></textarea>
        </div>
    </main>
    ${script}`
}

export { style, html }