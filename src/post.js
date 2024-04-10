const style = `<style>
* {
    box-sizing: border-box;
}
*::-webkit-scrollbar {
    width: 8px;
    height: 5px;
    background: transparent;
}
*::-webkit-scrollbar-thumb {
    background: rgb(229 231 235);
}

body {
    font-size: 14px;
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
    margin: 0;
}


img, svg {
    display: block;
    vertical-align: middle;
}
input {
    width: 100%;
    height: 32px;
    font-size: 100%;
    outline: none;
    background: rgb(243 244 246);
    border: none;
}
input::placeholder {
    color: #9ca3af;
}


input, aside .folder, aside .file {
    padding-left: 0.625rem;
    padding-right: 0.625rem;
    border-radius: 0.5rem;
}
input:hover, aside .folder:hover, aside .file:hover {
    background: rgb(229 231 235);
    transition: .06s ease-in-out;
}


aside, .asideBtn {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
}
aside {
    width: 20rem;
    background: rgb(248 248 248);
    transition: width .06s ease-in-out;
}
aside > div {
    padding: 1rem;
}
.asideBtn {
    display: none;
}
aside .toolbar {
    margin-bottom: 0.5rem;
}
aside .tree {
    height: 100%;
    overflow-y: auto;
}
aside .tree .folder, aside .file {
    height: 32px;
    display: flex;
    align-items: center;
    cursor: pointer;
}
aside .tree .folder-child {
    margin-left: 1rem;
    padding-left: 0.5rem;
    border-left: 2px solid rgb(206 208 210);
}
aside .tree .icon {
    margin-right: 0.375rem;
}
aside .tree span, aside .tree .file {
    color: inherit;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-decoration: none;
}

article {
    max-width: 80rem;
    margin-left: auto!important;
    margin-right: auto!important;
    padding: 4rem 1rem;
    padding-left: 21rem;
}

.hidden {
    display: none;
}

.twikoo {
    margin-top: 4rem;
}

@media screen and (max-width: 640px) {
    aside {
        width: 0;
        transform: translateX(-32px);
    }
    .asideBtn {
        display: flex;
        align-items: center;
        fill: rgb(172 172 172);
        background: rgb(248 248 248);
        z-index: 1;
    }
    .asideBtn svg {
        width: 15px;
        height: 15px;
        transition: .06s ease-in-out;
    }

    article {
        margin-left: 1rem!important;
        margin-right: 1rem!important;
        padding-left: 1rem;
    }
}
</style>`
const script = `<script>
        document.querySelectorAll('.tree .folder').forEach(folder => {
            folder.addEventListener('click', function() {
                const nextDom = this.nextElementSibling

                if (nextDom.style.display == 'none') {
                    this.querySelector('.icon').innerHTML = '<svg preserveAspectRatio="xMidYMin" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class="css-492dz9" style="--size: 16px; --rotate: 0deg;"><path fill-rule="evenodd" clip-rule="evenodd" d="M4 21.75C3.27065 21.75 2.57118 21.4603 2.05546 20.9445C1.53973 20.4288 1.25 19.7293 1.25 19V5C1.25 4.27065 1.53973 3.57118 2.05546 3.05546C2.57118 2.53973 3.27065 2.25 4 2.25H9C9.25076 2.25 9.48494 2.37533 9.62404 2.58397L11.4014 5.25H20C20.7293 5.25 21.4288 5.53973 21.9445 6.05546C22.4603 6.57118 22.75 7.27065 22.75 8V9.21268C23.5846 9.77191 24.0902 10.7735 23.9491 11.8557L22.9708 19.3557C22.7921 20.7254 21.6252 21.75 20.2439 21.75H4ZM3.11612 4.11612C3.35054 3.8817 3.66848 3.75 4 3.75H8.59861L10.376 6.41603C10.5151 6.62467 10.7492 6.75 11 6.75H20C20.3315 6.75 20.6495 6.8817 20.8839 7.11612C21.1183 7.35054 21.25 7.66848 21.25 8V8.75014C21.2407 8.75005 21.2315 8.75 21.2222 8.75H5.25604C4.15208 8.75 3.18502 9.4045 2.75 10.3666V5C2.75 4.66848 2.8817 4.35054 3.11612 4.11612ZM4.27778 20.25H20.2439C20.8718 20.25 21.4022 19.7843 21.4834 19.1617L22.4617 11.6617C22.5593 10.9135 21.9767 10.25 21.2222 10.25H5.25604C4.62818 10.25 4.09775 10.7157 4.01654 11.3383L3.03828 18.8383C2.94069 19.5865 3.52323 20.25 4.27778 20.25Z"></path></svg>'
                    nextDom.style.display = 'block'
                } else {
                    this.querySelector('.icon').innerHTML = '<svg preserveAspectRatio="xMidYMin" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class="css-492dz9" style="--size: 16px; --rotate: 0deg;"><path fill-rule="evenodd" clip-rule="evenodd" d="M4 3.75C3.66848 3.75 3.35054 3.8817 3.11612 4.11612C2.8817 4.35054 2.75 4.66848 2.75 5V19C2.75 19.3315 2.8817 19.6495 3.11612 19.8839C3.35054 20.1183 3.66848 20.25 4 20.25H20C20.3315 20.25 20.6495 20.1183 20.8839 19.8839C21.1183 19.6495 21.25 19.3315 21.25 19V8C21.25 7.66848 21.1183 7.35054 20.8839 7.11612C20.6495 6.8817 20.3315 6.75 20 6.75H11C10.7492 6.75 10.5151 6.62467 10.376 6.41603L8.59861 3.75H4ZM2.05546 3.05546C2.57118 2.53973 3.27065 2.25 4 2.25H9C9.25076 2.25 9.48494 2.37533 9.62404 2.58397L11.4014 5.25H20C20.7293 5.25 21.4288 5.53973 21.9445 6.05546C22.4603 6.57118 22.75 7.27065 22.75 8V19C22.75 19.7293 22.4603 20.4288 21.9445 20.9445C21.4288 21.4603 20.7293 21.75 20 21.75H4C3.27065 21.75 2.57118 21.4603 2.05546 20.9445C1.53973 20.4288 1.25 19.7293 1.25 19V5C1.25 4.27065 1.53973 3.57118 2.05546 3.05546Z"></path></svg>'
                    nextDom.style.display = 'none'
                }
            })
        })

        document.querySelectorAll('.asideBtn').forEach(btn => {
            btn.addEventListener('click', function() {
                const aside = document.querySelector('aside')

                if (aside.style.width == '0px') {
                    aside.style.width = '100%'
                    aside.style.transform = 'translateX(0px)'
                    this.querySelector('svg').style.transform = 'rotate(180deg)'
                } else {
                    aside.style.width = '0px'
                    aside.style.transform = 'translateX(-32px)'
                    this.querySelector('svg').style.transform = 'rotate(0deg)'
                }
            })
        })
    </script>`
const html = (content, tree) => {
    const marked = require('marked')
    let htmlStr = ''
    let dirStr = ''
    let dir = {}

    tree.reverse().forEach(({id, title}) => {
        const arr = title.split('/')

        if (arr.length == 1) {
            htmlStr += `
            <a class="file" href="/post-${id}">
                <div class="icon">
                    <svg preserveAspectRatio="xMidYMin" width="16" height="16" viewBox="0 0 24 24">
                        <path fill-rule="evenodd" clip-rule="evenodd" d="M2.58654 6.05769C2.29446 6.05769 2.05769 6.29446 2.05769 6.58654V16.9519C2.05769 17.244 2.29446 17.4808 2.58654 17.4808H21.4135C21.7055 17.4808 21.9423 17.244 21.9423 16.9519V6.58654C21.9423 6.29446 21.7055 6.05769 21.4135 6.05769H2.58654ZM1 6.58654C1 5.71032 1.71032 5 2.58654 5H21.4135C22.2897 5 23 5.71032 23 6.58654V16.9519C23 17.8281 22.2897 18.5385 21.4135 18.5385H2.58654C1.71032 18.5385 1 17.8281 1 16.9519V6.58654Z" fill="#808080"></path>
                        <path d="M4.17308 15.3654V8.17309H6.28846L8.40384 10.8173L10.5192 8.17309H12.6346V15.3654H10.5192V11.2404L8.40384 13.8846L6.28846 11.2404V15.3654H4.17308ZM17.3942 15.3654L14.2212 11.875H16.3365V8.17309H18.4519V11.875H20.5673L17.3942 15.3654Z" fill="#808080"></path>
                    </svg>
                </div>
                <span>${title}</span>
            </a>`
        } else {
            const [dirName, fileTitle] = arr
            if (dirName in dir)
                dir[dirName].push({ id, title: fileTitle })
            else
                dir[dirName] = [{ id, title: fileTitle }]
        }
    })

    Object.entries(dir)
        .forEach(([dirTitle, dirChild]) => {
            dirStr += `
            <div class="folder">
                <div class="icon">
                    <svg preserveAspectRatio="xMidYMin" width="16" height="16" viewBox="0 0 24 24">
                        <path fill-rule="evenodd" clip-rule="evenodd" d="M4 3.75C3.66848 3.75 3.35054 3.8817 3.11612 4.11612C2.8817 4.35054 2.75 4.66848 2.75 5V19C2.75 19.3315 2.8817 19.6495 3.11612 19.8839C3.35054 20.1183 3.66848 20.25 4 20.25H20C20.3315 20.25 20.6495 20.1183 20.8839 19.8839C21.1183 19.6495 21.25 19.3315 21.25 19V8C21.25 7.66848 21.1183 7.35054 20.8839 7.11612C20.6495 6.8817 20.3315 6.75 20 6.75H11C10.7492 6.75 10.5151 6.62467 10.376 6.41603L8.59861 3.75H4ZM2.05546 3.05546C2.57118 2.53973 3.27065 2.25 4 2.25H9C9.25076 2.25 9.48494 2.37533 9.62404 2.58397L11.4014 5.25H20C20.7293 5.25 21.4288 5.53973 21.9445 6.05546C22.4603 6.57118 22.75 7.27065 22.75 8V19C22.75 19.7293 22.4603 20.4288 21.9445 20.9445C21.4288 21.4603 20.7293 21.75 20 21.75H4C3.27065 21.75 2.57118 21.4603 2.05546 20.9445C1.53973 20.4288 1.25 19.7293 1.25 19V5C1.25 4.27065 1.53973 3.57118 2.05546 3.05546Z"></path>
                    </svg>
                </div>
                <span>${dirTitle}</span>
            </div>
            <div class="folder-child" style="display:none">`

            dirChild.forEach(({id, title}) => {
                dirStr += `
                <a class="file" href="/post-${id}">
                    <div class="icon">
                        <svg preserveAspectRatio="xMidYMin" width="16" height="16" viewBox="0 0 24 24">
                            <path fill-rule="evenodd" clip-rule="evenodd" d="M2.58654 6.05769C2.29446 6.05769 2.05769 6.29446 2.05769 6.58654V16.9519C2.05769 17.244 2.29446 17.4808 2.58654 17.4808H21.4135C21.7055 17.4808 21.9423 17.244 21.9423 16.9519V6.58654C21.9423 6.29446 21.7055 6.05769 21.4135 6.05769H2.58654ZM1 6.58654C1 5.71032 1.71032 5 2.58654 5H21.4135C22.2897 5 23 5.71032 23 6.58654V16.9519C23 17.8281 22.2897 18.5385 21.4135 18.5385H2.58654C1.71032 18.5385 1 17.8281 1 16.9519V6.58654Z" fill="#808080"></path>
                            <path d="M4.17308 15.3654V8.17309H6.28846L8.40384 10.8173L10.5192 8.17309H12.6346V15.3654H10.5192V11.2404L8.40384 13.8846L6.28846 11.2404V15.3654H4.17308ZM17.3942 15.3654L14.2212 11.875H16.3365V8.17309H18.4519V11.875H20.5673L17.3942 15.3654Z" fill="#808080"></path>
                        </svg>
                    </div>
                    <span>${title}</span>
                </a>`
            })

            dirStr += `
            </div>`
        })

    return `<div class="asideBtn"><svg preserveAspectRatio="xMidYMin" width="20" height="20" viewBox="0 0 24 24" ><path fill-rule="evenodd" clip-rule="evenodd" d="M15.5303 11.4697C15.8232 11.7626 15.8232 12.2374 15.5303 12.5303L9.53033 18.5303C9.23744 18.8232 8.76256 18.8232 8.46967 18.5303C8.17678 18.2374 8.17678 17.7626 8.46967 17.4697L13.9393 12L8.46967 6.53033C8.17678 6.23744 8.17678 5.76256 8.46967 5.46967C8.76256 5.17678 9.23744 5.17678 9.53033 5.46967L15.5303 11.4697Z"></path></svg></div>
    <aside>
        <div class="tree">
            ${dirStr + htmlStr}
        </div>
    </aside>
    <article class="markdown-body">
        ${marked.parse(content.content)}
    </article>
    ${script}`
}

export { style, html }