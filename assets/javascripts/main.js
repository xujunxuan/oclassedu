require([
    'app'
    , 'modules/library/models/site'
    , 'router'
], function(
    app
    , Site
    , Router
    ){
    "use strict";
    app.initialize();
    
/*    $.when(
        app.site.fetch({silent: true})
    ).always(function(){
        if(app.site.get('themes')){
            $('link#themes').attr('href','/assets/stylesheets/'+app.site.get('themes'));
        }
        
    });*/
    var res={
    "code": 0,
    "pkg": {
        "title": "中天东方视频教育服务平台",
        "is_reg": null,
        "college_name": "中天东方视频教育服务平台",
        "username": null,
        "pic": "http://localhost/uploads/res/54/79/res_54790aa2ff671de955c6bad20701aeef_19280.jpg",
        "themes": "0f5a82",
        "copyright": "中天东方视频教育服务平台 备案号：京ICP备15028931 <br />\r\n中国大学视频公开课适用于《中华人民共和国著作权法》<br />\r\n除非另有声明，本平台其它视频作品采用Creative Common知识共享署名-非商业性使用-相同方式共享 2.5 中国大陆许可协议进行许可",
        "en_title": "China Oriental Educational Media Platform",
        "links": null,
        "category": [
            {
                "id": "321",
                "dateline": "2015-05-28 17:21:19",
                "status": "0",
                "name": "文学",
                "detail": null,
                "pic": null,
                "link": null,
                "parent_id": "0",
                "is_rec": "1",
                "library_id": "18",
                "path": "0,321",
                "order_number": "0",
                "comments": null,
                "child_cate": []
            },
            {
                "id": "322",
                "dateline": "2015-05-28 17:21:37",
                "status": "0",
                "name": "哲学",
                "detail": null,
                "pic": null,
                "link": null,
                "parent_id": "0",
                "is_rec": "1",
                "library_id": "18",
                "path": "0,322",
                "order_number": "0",
                "comments": null,
                "child_cate": []
            },
            {
                "id": "323",
                "dateline": "2015-05-28 17:22:08",
                "status": "0",
                "name": "法学",
                "detail": null,
                "pic": null,
                "link": null,
                "parent_id": "0",
                "is_rec": "1",
                "library_id": "18",
                "path": "0,323",
                "order_number": "0",
                "comments": null,
                "child_cate": []
            },
            {
                "id": "324",
                "dateline": "2015-05-28 17:22:18",
                "status": "0",
                "name": "理学",
                "detail": null,
                "pic": null,
                "link": null,
                "parent_id": "0",
                "is_rec": "1",
                "library_id": "18",
                "path": "0,324",
                "order_number": "0",
                "comments": null,
                "child_cate": []
            },
            {
                "id": "325",
                "dateline": "2015-05-28 17:22:28",
                "status": "0",
                "name": "工学",
                "detail": null,
                "pic": null,
                "link": null,
                "parent_id": "0",
                "is_rec": "1",
                "library_id": "18",
                "path": "0,325",
                "order_number": "0",
                "comments": null,
                "child_cate": []
            },
            {
                "id": "326",
                "dateline": "2015-05-28 17:22:39",
                "status": "0",
                "name": "医学",
                "detail": null,
                "pic": null,
                "link": null,
                "parent_id": "0",
                "is_rec": "1",
                "library_id": "18",
                "path": "0,326",
                "order_number": "0",
                "comments": null,
                "child_cate": []
            },
            {
                "id": "327",
                "dateline": "2015-05-28 17:22:50",
                "status": "0",
                "name": "农学",
                "detail": null,
                "pic": null,
                "link": null,
                "parent_id": "0",
                "is_rec": "1",
                "library_id": "18",
                "path": "0,327",
                "order_number": "0",
                "comments": null,
                "child_cate": []
            },
            {
                "id": "328",
                "dateline": "2015-05-28 17:23:01",
                "status": "0",
                "name": "教育学",
                "detail": null,
                "pic": null,
                "link": null,
                "parent_id": "0",
                "is_rec": "1",
                "library_id": "18",
                "path": "0,328",
                "order_number": "0",
                "comments": null,
                "child_cate": []
            },
            {
                "id": "329",
                "dateline": "2015-05-28 17:23:12",
                "status": "0",
                "name": "历史学",
                "detail": null,
                "pic": null,
                "link": null,
                "parent_id": "0",
                "is_rec": "1",
                "library_id": "18",
                "path": "0,329",
                "order_number": "0",
                "comments": null,
                "child_cate": []
            },
            {
                "id": "330",
                "dateline": "2015-05-28 17:23:28",
                "status": "0",
                "name": "经济学",
                "detail": null,
                "pic": null,
                "link": null,
                "parent_id": "0",
                "is_rec": "1",
                "library_id": "18",
                "path": "0,330",
                "order_number": "0",
                "comments": null,
                "child_cate": []
            },
            {
                "id": "331",
                "dateline": "2015-05-28 17:23:41",
                "status": "0",
                "name": "管理学",
                "detail": null,
                "pic": null,
                "link": null,
                "parent_id": "0",
                "is_rec": "1",
                "library_id": "18",
                "path": "0,331",
                "order_number": "0",
                "comments": null,
                "child_cate": []
            },
            {
                "id": "332",
                "dateline": "2015-05-28 17:25:27",
                "status": "0",
                "name": "军事学",
                "detail": null,
                "pic": null,
                "link": null,
                "parent_id": "0",
                "is_rec": "1",
                "library_id": "18",
                "path": "0,332",
                "order_number": "0",
                "comments": null,
                "child_cate": []
            },
            {
                "id": "333",
                "dateline": "2015-05-28 17:25:44",
                "status": "0",
                "name": "艺术学",
                "detail": null,
                "pic": null,
                "link": null,
                "parent_id": "0",
                "is_rec": "1",
                "library_id": "18",
                "path": "0,333",
                "order_number": "0",
                "comments": null,
                "child_cate": []
            }
        ]
    }
}
    //app.site.defaults=res.pkg;
    app.site = new Site(res.pkg);
    console.log(app.site);
    //$('link#themes').attr('href','/assets/stylesheets/site_costiom_color_#0f5a82.css');
    var router = new Router();
});