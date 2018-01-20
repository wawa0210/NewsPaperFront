function guid() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }
    return s4() + s4() + '' + s4() + '' + s4() + '' +
        s4() + '' + s4() + s4() + s4();
}

//依赖全局WebApiHost参数
var WebApiToken;
var WebApiHost="http://localhost:4025/";
// var WebApiHost="http://221.209.110.28:5700/";
function doRequest(apiHost, method, data, callback, contentType, showtips) {
    //GetCookie
    if (!WebApiToken) {
        var cookies = document.cookie.split('; ');
        for (var i = 0, parts; (parts = cookies[i] && cookies[i].split('=')); i++) {
            if (parts.shift() === 'token') {
                WebApiToken = parts.join('=');
            }
        }
    }

    var requestType = 'application/x-www-form-urlencoded';
    if (contentType && contentType === 'json') {
        requestType = 'application/json';
    }

    $.ajax({
        type: method,
        url: apiHost,
        headers: {
            token: decodeURIComponent(WebApiToken),
            "request-id": guid() + new Date().getTime()
        },
        data: data,
        contentType: requestType,
        //xhrFields: {
        //    withCredentials: true
        //},
        //crossDomain: true,
        success: function (data) {
            callback(data);
        },
        error: function (err) {
            //$.dialog.tips("Request Error!");
        }
    });
}

function doGet(baseUrl, callback, showtips) {
    var requestUri = WebApiHost + "v0" + baseUrl;
    doRequest(requestUri, "GET", null, callback);
}

function doPost(baseUrl, data, callback, contentType, showtips) {
    var requestUri = WebApiHost + "v0" + baseUrl;
    doRequest(requestUri, "POST", data, callback, contentType);
}

function doPut(baseUrl, data, callback, contentType, showtips) {
    var requestUri = WebApiHost + "v0" + baseUrl;
    doRequest(requestUri, "PUT", data, callback, contentType);
}

function doDelete(baseUrl, data, callback, contentType, showtips) {
    var requestUri = WebApiHost + "v0" + baseUrl;
    doRequest(requestUri, "Delete", data, callback, contentType);
}

//获取url中的参数
function getUrlParam(name) {
    var reg = new RegExp("(^|&)" + name + "=([^&]*)(&|$)"); //构造一个含有目标参数的正则表达式对象
    var r = window.location.search.substr(1).match(reg);  //匹配目标参数
    if (r != null) return decodeURI(r[2]); return null; //返回参数值
}


//退出登录
function Loginout(){
    localStorage.clear();
    $.removeCookie("token");
    $.removeCookie("userid");
    window.location.href = "login.html";
}