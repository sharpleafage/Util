﻿//============== 表格包装器=======================
//Copyright 2018 何镇汐
//Licensed under the MIT license
//================================================
import { Component, Input, Output, ViewChild, ContentChild, AfterContentInit, EventEmitter } from '@angular/core';
import { MatTableDataSource, MatPaginator, MatPaginatorIntl, MatSort } from '@angular/material';
import { SelectionModel } from '@angular/cdk/collections';
import { WebApi as webapi } from '../common/webapi';
import { Message as message } from '../common/message';
import { PagerList } from '../core/pager-list';
import { ViewModel } from '../core/view-model';
import { QueryParameter } from '../core/query-parameter';
import { MessageConfig as config } from '../config/message-config';
import { DicService } from '../services/dic.service';

/**
 * 创建分页本地化提示
 */
function createMatPaginatorIntl() {
    let result = new MatPaginatorIntl();
    result.itemsPerPageLabel = "每页";
    result.nextPageLabel = "下页";
    result.previousPageLabel = "上页";
    result.getRangeLabel = (page: number, pageSize: number, length: number) => {
        if (length == 0 || pageSize == 0) { return `0`; }
        length = Math.max(length, 0);
        const startIndex = page * pageSize;
        const endIndex = startIndex < length ? Math.min(startIndex + pageSize, length) : startIndex + pageSize;
        return `当前：${startIndex + 1} - ${endIndex}，共: ${length}`;
    };
    return result;
}

/**
 * Mat表格包装器
 */
@Component({
    selector: 'mat-table-wrapper',
    providers: [{ provide: MatPaginatorIntl, useFactory: createMatPaginatorIntl }],
    template: `
        <div class="table-container mat-elevation-z8" [ngStyle]="getStyle()">
            <div class="table-loading-shade" *ngIf="loading">
                <mat-spinner></mat-spinner>
            </div>
            <ng-content></ng-content>
            <mat-paginator [length]="totalCount" [pageSize]="queryParam&&queryParam.pageSize" [pageSizeOptions]="pageSizeOptions"></mat-paginator>
        </div>
    `,
    styles: [`
        .table-container {
            display: flex;
            flex-direction: column;
            position: relative;
        }
        .table-loading-shade {
            position: absolute;
            top: 0;
            left: 0;
            bottom: 56px;
            right: 0;
            background: rgba(0, 0, 0, 0.15);
            z-index: 1;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        ::ng-deep .mat-table {
            overflow: auto;
        }
        ::ng-deep .table-header {
            min-height: 64px;
            padding: 8px 24px 0;
            z-index: 100;
        }
        ::ng-deep .mat-form-field {
            width: 100%;
        }
    `]
})
export class TableWrapperComponent<T extends ViewModel> implements AfterContentInit {
    /**
     * 显示进度条
     */
    private loading: boolean;
    /**
     * 总行数
     */
    private totalCount = 0;
    /**
     * 初始排序
     */
    private initOrder: string;
    /**
     * 数据源
     */
    dataSource: MatTableDataSource<T>;
    /**
     * checkbox选中列表
     */
    checkedSelection: SelectionModel<T>;
    /**
     * 点击行选中列表
     */
    selectedSelection: SelectionModel<T>;
    /**
     * 键
     */
    @Input() key: string;
    /**
     * 初始化时是否自动加载数据，默认为true,设置成false则手工加载
     */
    @Input() autoLoad: boolean;
    /**
     * 最大高度
     */
    @Input() maxHeight: number;
    /**
     * 最小高度
     */
    @Input() minHeight: number;
    /**
     * 宽度
     */
    @Input() width: number;
    /**
     * 分页长度列表
     */
    @Input() pageSizeOptions: number[];
    /**
    * 基地址，基于该地址构建加载地址和删除地址，范例：传入test,则加载地址为/api/test,删除地址为/api/test/delete
    */
    @Input() baseUrl: string;
    /**
     * 数据加载地址，范例：/api/test
     */
    @Input() url: string;
    /**
     * 删除地址，注意：由于支持批量删除，所以采用Post提交，范例：/api/test/delete
     */
    @Input() deleteUrl: string;
    /**
     * 查询参数
     */
    @Input() queryParam: QueryParameter;
    /**
     * 查询参数还原事件
     */
    @Output() onQueryRestore = new EventEmitter<QueryParameter>();
    /**
     * 排序组件
     */
    @ContentChild(MatSort) sort: MatSort;
    /**
     * 分页组件
     */
    @ViewChild(MatPaginator) paginator: MatPaginator;

    /**
     * 初始化Mat表格包装器
     */
    constructor(private dic: DicService<QueryParameter>) {
        this.minHeight = 300;
        this.pageSizeOptions = [10, 20, 50, 100];
        this.dataSource = new MatTableDataSource<T>();
        this.checkedSelection = new SelectionModel<T>(true, []);
        this.selectedSelection = new SelectionModel<T>(false, []);
        this.loading = false;
        this.autoLoad = true;
        this.queryParam = new QueryParameter();
    }

    /**
     * 内容加载完成时进行初始化
     */
    ngAfterContentInit() {
        this.initPaginator();
        this.initSort();
        this.restoreQueryParam();
        if (this.autoLoad)
            this.query();
    }

    /**
     * 初始化分页组件
     */
    private initPaginator() {
        this.initPage();
        this.paginator.page.subscribe(() => {
            this.queryParam.page = this.paginator.pageIndex + 1;
            this.queryParam.pageSize = this.paginator.pageSize;
            this.query();
        });
    }

    /**
     * 初始化分页参数
     */
    private initPage() {
        this.queryParam.page = 1;
        if (this.pageSizeOptions && this.pageSizeOptions.length > 0)
            this.queryParam.pageSize = this.pageSizeOptions[0];
    }

    /**
    * 初始化排序组件
    */
    private initSort() {
        if (!this.sort)
            return;
        this.setOrder();
        this.sort.sortChange && this.sort.sortChange.subscribe(() => {
            this.setOrder();
            this.query();
        });
    }

    /**
     * 设置排序
     */
    private setOrder() {
        if (!this.sort.active)
            return;
        let order = `${this.sort.active} ${this.sort.direction}`;
        if (!this.initOrder)
            this.initOrder = order;
        this.queryParam.order = order;
    }

    /**
     * 还原查询参数
     */
    private restoreQueryParam() {
        if (!this.key)
            return;
        let query = this.dic.get(this.key);
        if (!query)
            return;
        this.queryParam = query;
        this.onQueryRestore.emit(query);
    }

    /**
     * 发送查询请求
     */
    query() {
        let url = this.url || (this.baseUrl && `/api/${this.baseUrl}`);
        if (!url) {
            console.log("表格url未设置");
            return;
        }
        this.filterParam();
        if (this.key)
            this.dic.add(this.key, this.queryParam);
        webapi.get<PagerList<T>>(url).param(this.queryParam).handle({
            beforeHandler: () => { this.loading = true; return true; },
            handler: result => {
                result = new PagerList<T>(result);
                result.initLineNumbers();
                this.dataSource.data = result.data;
                this.paginator.pageIndex = result.page - 1;
                this.totalCount = result.totalCount;
                this.checkedSelection.clear();
            },
            completeHandler: () => this.loading = false
        });
    }

    /**
     * 过滤参数
     */
    private filterParam() {
        if (this.queryParam.keyword === null)
            this.queryParam.keyword = "";
    }

    /**
     * 刷新表格
     * @param queryParam 查询参数
     */
    refresh(queryParam) {
        this.queryParam = queryParam;
        this.initPage();
        this.queryParam.order = this.initOrder;
        this.dic.remove(this.key);
        this.query();
    }

    /**
     * 获取样式
     */
    private getStyle() {
        return {
            'max-height': this.maxHeight ? `${this.maxHeight}px` : null,
            'width': this.width ? `${this.width}px` : null
        };
    }

    /**
     * 表头主复选框切换选中状态
     */
    masterToggle() {
        if (this.isMasterChecked()) {
            this.checkedSelection.clear();
            return;
        }
        this.dataSource.data.forEach(data => this.checkedSelection.select(data));
    }

    /**
     * 表头主复选框的选中状态
     */
    isMasterChecked() {
        return this.checkedSelection.hasValue() &&
            this.isAllChecked() &&
            this.checkedSelection.selected.length >= this.dataSource.data.length;
    }

    /**
     * 是否所有行复选框被选中
     */
    private isAllChecked() {
        return this.dataSource.data.every(data => this.checkedSelection.isSelected(data));
    }

    /**
     * 表头主复选框的确定状态
     */
    isMasterIndeterminate() {
        return this.checkedSelection.hasValue() && (!this.isAllChecked() || !this.dataSource.data.length);
    }

    /**
     * 获取复选框被选中实体列表
     */
    getChecked(): T[] {
        return this.dataSource.data.filter(data => this.checkedSelection.isSelected(data));
    }

    /**
     * 获取复选框被选中实体Id列表
     */
    getCheckedIds(): string {
        return this.getChecked().map((value) => value.id).join(",");
    }

    /**
     * 批量删除被选中实体
     * @param ids 待删除的Id列表，多个Id用逗号分隔，范例：1,2,3
     * @param handler 删除成功回调函数
     * @param deleteUrl 服务端删除Api地址，如果设置了基地址baseUrl，则可以省略该参数
     */
    delete(ids?: string, handler?: () => {}, deleteUrl?: string) {
        ids = ids || this.getCheckedIds();
        if (!ids) {
            message.warn(config.deleteNotSelected);
            return;
        }
        message.confirm(config.deleteConfirm, () => {
            this.deleteRequest(ids, handler, deleteUrl);
        });
    }

    /**
     * 发送删除请求
     */
    private deleteRequest(ids?: string, handler?: () => {}, deleteUrl?: string) {
        deleteUrl = deleteUrl || this.deleteUrl || (this.baseUrl && `/api/${this.baseUrl}/delete`);
        if (!deleteUrl) {
            console.log("表格deleteUrl未设置");
            return;
        }
        webapi.post(deleteUrl, ids).handle({
            handler: () => {
                if (handler) {
                    handler();
                    return;
                }
                message.snack(config.deleteSuccessed);
                this.query();
            }
        });
    }
}